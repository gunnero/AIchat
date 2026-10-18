import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { asyncTransaction as transaction } from "./database.mjs";
import {
  token,
  digest,
  equal,
  csrfFor,
  hashPassword,
  verifyPassword,
  seal,
  unseal,
  newOtpSecret,
  otp,
  otpStep,
} from "./security.mjs";
import { recoveryMessage, securityNotice } from "./mail.mjs";
const P = "/backoffice/api/auth",
  minute = 60000;
const rawToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const password = z.string().min(14).max(256);
const code = z.string().regex(/^\d{6}$/);
export const credentialTag = (a) =>
  digest(a.password_hash + "\0" + a.mfa_secret);
export const recoveryCodeHash = (id, value) =>
  digest("recovery:" + id + ":" + value.replace(/[-\s]/g, "").toUpperCase());
export async function replaceRecoveryCodes(db, id, now) {
  const codes = Array.from({ length: 10 }, () =>
    randomBytes(16).toString("hex").toUpperCase().match(/.{4}/g).join("-"),
  );
  await db.prepare("DELETE FROM recovery_codes WHERE account_id=?").run(id);
  for (const value of codes)
    await db
      .prepare("INSERT INTO recovery_codes VALUES(?,?,?)")
      .run(id, recoveryCodeHash(id, value), now);
  return codes;
}
export async function revokeRecovery(db, id) {
  await db
    .prepare(
      "UPDATE recovery_requests SET status='revoked' WHERE account_id=? AND status IN ('sending','sent','verified')",
    )
    .run(id);
  await db
    .prepare(
      "DELETE FROM recovery_sessions WHERE request_id IN (SELECT id FROM recovery_requests WHERE account_id=?)",
    )
    .run(id);
  await db.prepare("DELETE FROM recovery_support WHERE account_id=?").run(id);
}
export function installRecovery(
  app,
  {
    vaultKey,
    origin,
    clock,
    fail,
    audit,
    mailer,
    consumeOtp,
    stillAuthorized,
    cookieOptions,
    SID,
  },
) {
  const db = app.db,
    pending = new Set(),
    RR = cookieOptions.secure ? "__Host-ai_recovery" : "ai_recovery_local";
  const restrictedCookie = { ...cookieOptions, maxAge: 600 };
  const background = (fn) => {
    const work = new Promise((resolve) => setImmediate(resolve))
      .then(fn)
      .catch(() => {});
    pending.add(work);
    work.finally(() => pending.delete(work));
  };
  app.decorate("recoveryIdle", async () => {
    while (pending.size) await Promise.all([...pending]);
  });
  app.addHook("onClose", () => app.recoveryIdle());
  const eligible = async (id) =>
    db
      .prepare(
        "SELECT a.* FROM admins a LEFT JOIN customers c ON c.id=a.customer_id WHERE a.id=? AND a.status='active' AND (a.role='admin' OR c.status='active')",
      )
      .get(id);
  async function limited(bucket, max, window, consume = true) {
    const old = await db
      .prepare("SELECT * FROM recovery_limits WHERE bucket=?")
      .get(bucket);
    if (old && old.reset_at > clock() && old.attempts >= max) return true;
    if (consume)
      await db
        .prepare(
          "INSERT INTO recovery_limits VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN recovery_limits.reset_at<=? THEN 1 ELSE recovery_limits.attempts+1 END,reset_at=CASE WHEN recovery_limits.reset_at<=? THEN excluded.reset_at ELSE recovery_limits.reset_at END",
        )
        .run(bucket, clock() + window, clock(), clock());
    return false;
  }
  async function live(r, verified = false) {
    const sid = r.cookies[RR],
      s =
        sid &&
        (await db
          .prepare("SELECT * FROM recovery_sessions WHERE hash=?")
          .get(digest(sid)));
    if (
      !s ||
      s.expires <= clock() ||
      !equal(r.headers["x-csrf-token"], csrfFor(vaultKey, sid))
    )
      fail(403, "Gendannelsen er udløbet. Bed om et nyt link.");
    const request = await db
      .prepare("SELECT * FROM recovery_requests WHERE id=?")
      .get(s.request_id);
    const a = request && (await eligible(request.account_id));
    if (
      !request ||
      request.expires <= clock() ||
      request.status !== (verified ? "verified" : "sent") ||
      s.verified !== (verified ? 1 : 0) ||
      !a ||
      request.credential_tag !== credentialTag(a)
    )
      fail(400, "Linket er ugyldigt eller udløbet. Bed om et nyt link.");
    return { s, request, a };
  }
  const invalid = () =>
    fail(400, "Oplysningerne blev ikke godkendt. Prøv igen.");
  const clear = (reply) => {
    reply.clearCookie(RR, { path: "/" });
    reply.clearCookie(SID, cookieOptions);
  };
  function notice(a, kind) {
    background(async () => {
      let ok = false;
      try {
        ok = await mailer(
          securityNotice({
            email: a.email,
            locale: a.locale,
            kind,
            url: origin + "/",
          }),
        );
      } catch {}
      await audit(
        a.id,
        ok
          ? "account.security_notice_queued"
          : "account.security_notice_failed",
        a.id,
      );
    });
  }
  async function finish(a, request, reply, hash, newMfa) {
    if (newMfa)
      await db
        .prepare(
          "UPDATE admins SET password_hash=?,mfa_secret=?,last_step=? WHERE id=?",
        )
        .run(hash, newMfa.secret, newMfa.step, a.id);
    else
      await db
        .prepare("UPDATE admins SET password_hash=? WHERE id=?")
        .run(hash, a.id);
    await db.prepare("DELETE FROM sessions WHERE admin_id=?").run(a.id);
    await db
      .prepare(
        "DELETE FROM registrations WHERE invitation_id IN (SELECT id FROM invitations WHERE account_id=?)",
      )
      .run(a.id);
    await revokeRecovery(db, a.id);
    await db
      .prepare("UPDATE recovery_requests SET status='used' WHERE id=?")
      .run(request.id);
    await audit(
      a.id,
      newMfa ? "account.authenticator_recovered" : "account.password_recovered",
      a.id,
    );
    clear(reply);
  }
  const routeLimit = {
    config: { rateLimit: { max: 15, timeWindow: "10 minutes" } },
  };
  app.post(P + "/recovery/request", routeLimit, async (r) => {
    const started = performance.now();
    const v = z
      .object({
        email: z
          .email()
          .max(254)
          .transform((v) => v.toLowerCase()),
        locale: z.enum(["en", "da"]),
      })
      .strict()
      .parse(r.body);
    let delivery;
    await transaction(db, async () => {
      if (await limited("request:" + digest(v.email), 1, minute)) return;
      const a = await db
        .prepare("SELECT * FROM admins WHERE email=?")
        .get(v.email);
      if (!a || !(await eligible(a.id))) return;
      if (await limited("request-hour:" + a.id, 4, 60 * minute)) return;
      await db
        .prepare("DELETE FROM recovery_requests WHERE expires<=?")
        .run(clock());
      await db
        .prepare("DELETE FROM recovery_limits WHERE reset_at<=?")
        .run(clock());
      const raw = token(),
        id = randomUUID();
      await db
        .prepare("INSERT INTO recovery_requests VALUES(?,?,?,?,?,?,?)")
        .run(
          id,
          a.id,
          digest(raw),
          credentialTag(a),
          "sending",
          clock(),
          clock() + 30 * minute,
        );
      delivery = { a, raw, id, locale: v.locale };
      await audit(a.id, "account.recovery_requested", a.id);
    });
    if (delivery)
      background(async () => {
        const { a, raw, id, locale } = delivery;
        let accepted = false;
        try {
          accepted = await mailer(
            recoveryMessage({
              email: a.email,
              locale,
              url: origin + "/#recover=" + raw,
            }),
          );
        } catch {}
        await transaction(db, async () => {
          const current = await eligible(a.id);
          await db
            .prepare(
              "UPDATE recovery_requests SET status=? WHERE id=? AND status='sending' AND expires>?",
            )
            .run(
              accepted && current && credentialTag(current) === credentialTag(a)
                ? "sent"
                : "failed",
              id,
              clock(),
            );
          await audit(
            a.id,
            accepted
              ? "account.recovery_email_queued"
              : "account.recovery_email_failed",
            a.id,
          );
        });
      });
    // Normalize fast lookup paths; SMTP work is independent of this response.
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, 250 - (performance.now() - started))),
    );
    return {
      message:
        "Hvis kontoen kan gendannes, modtager du en e-mail med et link. Tjek også spam. Linket udløber efter 30 minutter.",
    };
  });
  app.post(P + "/recovery/begin", routeLimit, async (r, reply) => {
    const { token: raw } = z.object({ token: rawToken }).strict().parse(r.body);
    const sid = token();
    await transaction(db, async () => {
      const request = await db
        .prepare("SELECT * FROM recovery_requests WHERE token_hash=?")
        .get(digest(raw));
      const a = request && (await eligible(request.account_id));
      if (
        !request ||
        request.status !== "sent" ||
        request.expires <= clock() ||
        !a ||
        credentialTag(a) !== request.credential_tag
      )
        fail(400, "Linket er ugyldigt eller udløbet. Bed om et nyt link.");
      if (r.cookies[RR])
        await db
          .prepare("DELETE FROM recovery_sessions WHERE hash=?")
          .run(digest(r.cookies[RR]));
      await db
        .prepare("DELETE FROM recovery_sessions WHERE expires<=?")
        .run(clock());
      const count = await db
        .prepare(
          "SELECT count(*) AS n FROM recovery_sessions WHERE request_id=?",
        )
        .get(request.id);
      if (count.n >= 5) fail(429, "For mange forsøg. Vent lidt og prøv igen.");
      await db
        .prepare(
          "INSERT INTO recovery_sessions(hash,request_id,expires) VALUES(?,?,?)",
        )
        .run(
          digest(sid),
          request.id,
          Math.min(request.expires, clock() + 10 * minute),
        );
    });
    reply.setCookie(RR, sid, restrictedCookie);
    return { csrf: csrfFor(vaultKey, sid) };
  });
  app.post(P + "/recovery/password", routeLimit, async (r, reply) => {
    const v = z.object({ newPassword: password, code }).strict().parse(r.body);
    const initial = await live(r);
    if (await limited("proof:" + initial.a.id, 5, 10 * minute, false))
      fail(429, "For mange forsøg. Vent lidt og prøv igen.");
    const hash = await hashPassword(v.newPassword);
    let a;
    const success = await transaction(db, async () => {
      const context = await live(r);
      a = context.a;
      if (await limited("proof:" + a.id, 5, 10 * minute, false))
        return "limited";
      if (!(await consumeOtp(a, v.code))) {
        await limited("proof:" + a.id, 5, 10 * minute);
        return false;
      }
      await finish(a, context.request, reply, hash);
      return true;
    });
    if (success === "limited")
      fail(429, "For mange forsøg. Vent lidt og prøv igen.");
    if (!success) invalid();
    notice(a, "password");
    return { ok: true };
  });
  app.post(P + "/recovery/authenticator", routeLimit, async (r) => {
    const v = z
      .union([
        z
          .object({
            password: z.string().min(1).max(256),
            recoveryCode: z.string().min(16).max(100),
          })
          .strict(),
        z.object({ supportCode: rawToken }).strict(),
      ])
      .parse(r.body);
    const context = await live(r);
    if (await limited("proof:" + context.a.id, 5, 10 * minute, false))
      fail(429, "For mange forsøg. Vent lidt og prøv igen.");
    const valid =
      "supportCode" in v
        ? false
        : await verifyPassword(v.password, context.a.password_hash);
    let uri, secret;
    const success = await transaction(db, async () => {
      const { a, s, request } = await live(r);
      if (await limited("proof:" + a.id, 5, 10 * minute, false))
        return "limited";
      let consumed = false;
      if ("supportCode" in v) {
        consumed =
          (
            await db
              .prepare(
                "DELETE FROM recovery_support WHERE account_id=? AND code_hash=? AND expires>?",
              )
              .run(
                a.id,
                digest("support:" + a.id + ":" + v.supportCode),
                clock(),
              )
          ).changes === 1;
      } else if (valid && context.a.password_hash === a.password_hash) {
        consumed =
          (
            await db
              .prepare(
                "DELETE FROM recovery_codes WHERE account_id=? AND hash=?",
              )
              .run(a.id, recoveryCodeHash(a.id, v.recoveryCode))
          ).changes === 1;
      }
      if (!consumed) {
        await limited("proof:" + a.id, 5, 10 * minute);
        return false;
      }
      secret = newOtpSecret();
      uri = otp(secret, a.email).toString();
      await db
        .prepare(
          "UPDATE recovery_requests SET status='revoked' WHERE account_id=? AND id<>? AND status IN ('sending','sent','verified')",
        )
        .run(a.id, request.id);
      await db
        .prepare(
          "DELETE FROM recovery_sessions WHERE request_id IN (SELECT id FROM recovery_requests WHERE account_id=?) AND hash<>?",
        )
        .run(a.id, s.hash);
      await db
        .prepare("UPDATE recovery_requests SET status='verified' WHERE id=?")
        .run(request.id);
      await db
        .prepare(
          "UPDATE recovery_sessions SET verified=1,secret=? WHERE hash=?",
        )
        .run(seal(vaultKey, secret, "recovery:" + s.hash), s.hash);
      await audit(a.id, "account.recovery_factor_verified", a.id);
      return true;
    });
    if (success === "limited")
      fail(429, "For mange forsøg. Vent lidt og prøv igen.");
    if (!success) invalid();
    return { secret, uri };
  });
  app.post(P + "/recovery/complete", routeLimit, async (r, reply) => {
    const v = z.object({ newPassword: password, code }).strict().parse(r.body);
    const initial = await live(r, true);
    if (await limited("new-factor:" + initial.a.id, 5, 10 * minute, false))
      fail(429, "For mange forsøg. Vent lidt og prøv igen.");
    const hash = await hashPassword(v.newPassword);
    let a, codes;
    const success = await transaction(db, async () => {
      const { a: current, s, request } = await live(r, true);
      a = current;
      if (await limited("new-factor:" + a.id, 5, 10 * minute, false))
        return "limited";
      const secret = unseal(vaultKey, s.secret, "recovery:" + s.hash),
        step = otpStep(secret, v.code, clock());
      if (step === null) {
        await limited("new-factor:" + a.id, 5, 10 * minute);
        return false;
      }
      await finish(a, request, reply, hash, {
        secret: seal(vaultKey, secret, "mfa:" + a.id),
        step,
      });
      codes = await replaceRecoveryCodes(db, a.id, clock());
      return true;
    });
    if (success === "limited")
      fail(429, "For mange forsøg. Vent lidt og prøv igen.");
    if (!success) invalid();
    notice(a, "authenticator");
    return { ok: true, codes };
  });
  app.get(P + "/codes", async (r) => ({
    remaining: (
      await db
        .prepare("SELECT count(*) AS n FROM recovery_codes WHERE account_id=?")
        .get(r.adminId)
    ).n,
  }));
  app.post(
    P + "/codes",
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (r) => {
      const v = z
        .object({ password: z.string().min(1).max(256), code })
        .strict()
        .parse(r.body);
      const snapshot = await db
        .prepare("SELECT * FROM admins WHERE id=?")
        .get(r.adminId);
      if (await limited("codes:" + r.adminId, 5, 10 * minute, false))
        fail(429, "For mange forsøg. Vent lidt og prøv igen.");
      const valid = await verifyPassword(v.password, snapshot.password_hash);
      const result = await transaction(db, async () => {
        await stillAuthorized(r);
        const a = await eligible(r.adminId);
        if (await limited("codes:" + r.adminId, 5, 10 * minute, false))
          return "limited";
        if (
          !valid ||
          !a ||
          credentialTag(a) !== credentialTag(snapshot) ||
          !(await consumeOtp(a, v.code))
        ) {
          await limited("codes:" + r.adminId, 5, 10 * minute);
          return false;
        }
        await revokeRecovery(db, a.id);
        const codes = await replaceRecoveryCodes(db, a.id, clock());
        await audit(a.id, "account.recovery_codes_rotated", a.id);
        return { codes };
      });
      if (result === "limited")
        fail(429, "For mange forsøg. Vent lidt og prøv igen.");
      if (!result) invalid();
      return result;
    },
  );
  return { replaceCodes: (id) => replaceRecoveryCodes(db, id, clock()) };
}
