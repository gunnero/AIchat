import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  token,
  digest,
  equal,
  csrfFor,
  newOtpSecret,
  seal,
  unseal,
  otp,
  otpStep,
  hashPassword,
} from "./security.mjs";
import { asyncTransaction as transaction } from "./database.mjs";
import { invitationMessage } from "./mail.mjs";
import { workspaceSettings } from "./account-area.mjs";
const P = "/backoffice/api";
export const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9_.-]{2,39}$/);
const email = z
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
const locale = z.enum(["en", "da"]);
const profile = z
  .object({ name: z.string().trim().min(1).max(100), email, locale })
  .strict();
const invitationToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const REG = "bo_registration";
export function installAccounts(
  app,
  {
    vaultKey,
    origin,
    clock,
    stamp,
    audit,
    fail,
    fresh,
    stillAuthorized,
    cookieOptions,
    mailer,
  },
) {
  const db = app.db;
  const account = async (id) =>
    await db.prepare("SELECT * FROM admins WHERE id=?").get(id);
  const inviteMeta = async (id) =>
    (await db
      .prepare(
        "SELECT id,status,expires FROM invitations WHERE account_id=? ORDER BY rowid DESC LIMIT 1",
      )
      .get(id)) || null;
  const safe = async (a) => ({
    id: a.id,
    name:
      (
        await db
          .prepare(
            "SELECT display_name FROM account_profiles WHERE account_id=?",
          )
          .get(a.id)
      )?.display_name || a.name,
    email: a.email,
    username: a.username,
    status: a.status,
    locale: a.locale,
    role: a.role === "admin" ? "Admin" : "Customer",
    invitation: await inviteMeta(a.id),
    ...(await workspaceSettings(db, a)),
  });
  const guard = async (id) => {
    const a = await account(id);
    if (!a || a.role !== "admin") fail(404, "Kontoen findes ikke.");
    if (a.protected) fail(403, "Kontoen kan ikke ændres.");
    return a;
  };
  async function invite(id, actor, r) {
    const a = await account(id);
    if (!a || a.status !== "pending" || a.protected)
      fail(409, "Kontoen kan ikke inviteres.");
    const previous = await inviteMeta(id);
    if (
      previous &&
      previous.status !== "failed" &&
      previous.expires > clock() &&
      (
        await db
          .prepare("SELECT created_at FROM invitations WHERE id=?")
          .get(previous.id)
      ).created_at > new Date(clock() - 60000).toISOString()
    )
      fail(429, "Vent et minut før du sender igen.");
    const raw = token(),
      iid = randomUUID();
    await transaction(db, async () => {
      if (r?.session) await stillAuthorized(r);
      await db
        .prepare(
          "UPDATE invitations SET status='revoked' WHERE account_id=? AND status IN ('sending','sent','failed')",
        )
        .run(id);
      await db
        .prepare(
          "DELETE FROM registrations WHERE invitation_id IN (SELECT id FROM invitations WHERE account_id=?)",
        )
        .run(id);
      await db
        .prepare("INSERT INTO invitations VALUES(?,?,?,?,?,?)")
        .run(
          iid,
          id,
          digest(raw),
          clock() + 48 * 60 * 60 * 1000,
          "sending",
          stamp(),
        );
      await audit(actor, "invitation.created", id);
    });
    let accepted = false;
    try {
      accepted = await mailer(
        invitationMessage({
          email: a.email,
          name: a.name,
          locale: a.locale,
          role: a.role,
          url: origin + "/backoffice/#invite=" + raw,
        }),
      );
    } catch {
      /* never expose provider/body/token */
    }
    const status = accepted ? "sent" : "failed";
    await transaction(db, async () => {
      await db
        .prepare(
          "UPDATE invitations SET status=? WHERE id=? AND status='sending'",
        )
        .run(status, iid);
      await audit(
        actor,
        accepted ? "invitation.queued" : "invitation.failed",
        id,
      );
    });
    return { invitation: status };
  }
  const liveInvite = async (raw) => {
    const i = await db
      .prepare(
        "SELECT invitations.*,admins.email,admins.name,admins.locale,admins.role,admins.status AS account_status FROM invitations JOIN admins ON admins.id=invitations.account_id WHERE token_hash=?",
      )
      .get(digest(raw));
    if (
      !i ||
      i.status !== "sent" ||
      i.expires <= clock() ||
      i.account_status !== "pending"
    )
      fail(
        400,
        "Invitationen er ugyldig eller udløbet. Bed om en ny invitation.",
      );
    return i;
  };
  const regCookie = { ...cookieOptions, path: P + "/register", maxAge: 1200 };
  app.post(
    P + "/register/begin",
    { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } },
    async (r, reply) => {
      const { token: raw } = z
        .object({ token: invitationToken })
        .strict()
        .parse(r.body);
      const i = await liveInvite(raw),
        sid = token(),
        secret = newOtpSecret();
      // A stolen/resent link cannot inherit an earlier enrollment cookie or seed.
      await transaction(db, async () => {
        if (r.session) await stillAuthorized(r);
        await db
          .prepare(
            "DELETE FROM registrations WHERE expires<=? OR invitation_id=?",
          )
          .run(clock(), i.id);
        await db
          .prepare("INSERT INTO registrations VALUES(?,?,?,?)")
          .run(
            digest(sid),
            i.id,
            seal(vaultKey, secret, "registration:" + digest(sid)),
            Math.min(clock() + 20 * 60 * 1000, i.expires),
          );
      });
      reply.setCookie(REG, sid, regCookie);
      return {
        name: i.name,
        email: i.email,
        locale: i.locale,
        role: i.role === "admin" ? "Admin" : "Customer",
        secret,
        uri: otp(secret, i.email).toString(),
        csrf: csrfFor(vaultKey, sid),
      };
    },
  );
  app.post(
    P + "/register/complete",
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (r, reply) => {
      const v = z
        .object({
          username,
          password: z.string().min(14).max(256),
          code: z.string().regex(/^\d{6}$/),
        })
        .strict()
        .parse(r.body);
      const sid = r.cookies[REG],
        reg =
          sid &&
          (await db
            .prepare("SELECT * FROM registrations WHERE hash=?")
            .get(digest(sid)));
      if (
        !reg ||
        reg.expires <= clock() ||
        !equal(r.headers["x-csrf-token"], csrfFor(vaultKey, sid))
      )
        fail(403, "Registreringen er udløbet. Åbn invitationen igen.");
      const i = await db
        .prepare("SELECT * FROM invitations WHERE id=?")
        .get(reg.invitation_id);
      if (!i || i.status !== "sent" || i.expires <= clock())
        fail(
          400,
          "Invitationen er ugyldig eller udløbet. Bed om en ny invitation.",
        );
      const secret = unseal(vaultKey, reg.secret, "registration:" + reg.hash),
        step = otpStep(secret, v.code, clock());
      if (step === null)
        fail(400, "Brug en gyldig kode fra din authenticator.");
      const hash = await hashPassword(v.password);
      await transaction(db, async () => {
        if (r.session) await stillAuthorized(r);
        const live = await db
            .prepare("SELECT * FROM registrations WHERE hash=?")
            .get(reg.hash),
          a = await account(i.account_id);
        if (
          !live ||
          live.expires <= clock() ||
          !a ||
          a.status !== "pending" ||
          !(
            await db
              .prepare(
                "UPDATE invitations SET status='used' WHERE id=? AND status='sent' AND expires>?",
              )
              .run(i.id, clock())
          ).changes
        )
          fail(409, "Invitationen er ikke længere gyldig.");
        await db
          .prepare(
            "UPDATE admins SET username=?,password_hash=?,mfa_secret=?,last_step=?,status='active' WHERE id=?",
          )
          .run(
            v.username,
            hash,
            seal(vaultKey, secret, "mfa:" + a.id),
            step,
            a.id,
          );
        await db
          .prepare("DELETE FROM registrations WHERE invitation_id=?")
          .run(i.id);
        await db
          .prepare(
            "UPDATE invitations SET status='revoked' WHERE account_id=? AND status IN ('sending','sent','failed')",
          )
          .run(a.id);
        if (a.customer_id)
          await db
            .prepare(
              "UPDATE customers SET status=CASE WHEN status='pending' THEN 'active' ELSE status END,updated_at=? WHERE id=?",
            )
            .run(stamp(), a.customer_id);
        await audit(a.id, "account.activated", a.id);
      });
      reply.clearCookie(REG, { path: P + "/register" });
      return { ok: true };
    },
  );
  app.get(
    P + "/staff",
    async () =>
      await Promise.all(
        (
          await db
            .prepare(
              "SELECT * FROM admins WHERE role='admin' ORDER BY name COLLATE NOCASE",
            )
            .all()
        ).map(safe),
      ),
  );
  app.post(P + "/staff", async (r) => {
    fresh(r);
    const v = profile.parse(r.body),
      id = randomUUID();
    await transaction(db, async () => {
      if (r.session) await stillAuthorized(r);
      await db
        .prepare(
          "INSERT INTO admins(id,email,name,password_hash,mfa_secret,last_step,created_at,role,status,locale) VALUES(?,?,?,'','',-1,?,'admin','pending',?)",
        )
        .run(id, v.email, v.name, stamp(), v.locale);
      await audit(r.adminId, "staff.created", id);
    });
    const result = await invite(id, r.adminId, r);
    await stillAuthorized(r);
    return { id, ...result };
  });
  app.put(P + "/staff/:id", async (r) => {
    fresh(r);
    const id = z.uuid().parse(r.params.id);
    await guard(id);
    const v = z
      .object({
        name: z.string().trim().min(1).max(100),
        status: z.enum(["pending", "active", "paused"]),
        locale,
      })
      .strict()
      .parse(r.body);
    await transaction(db, async () => {
      if (r.session) await stillAuthorized(r);
      const a = await guard(id);
      if (
        (a.status === "pending" && v.status !== "pending") ||
        (a.status !== "pending" && v.status === "pending")
      )
        fail(400, "Kontoen skal aktiveres gennem invitationen.");
      await db
        .prepare("UPDATE admins SET name=?,status=?,locale=? WHERE id=?")
        .run(v.name, v.status, v.locale, id);
      await db
        .prepare("DELETE FROM account_profiles WHERE account_id=?")
        .run(id);
      if (v.status === "paused")
        await db.prepare("DELETE FROM sessions WHERE admin_id=?").run(id);
      await audit(r.adminId, "staff.updated", id);
    });
    return { id };
  });
  app.delete(P + "/staff/:id", async (r) => {
    fresh(r);
    const id = z.uuid().parse(r.params.id);
    await guard(id);
    await transaction(db, async () => {
      if (r.session) await stillAuthorized(r);
      await db.prepare("UPDATE admins SET status='paused' WHERE id=?").run(id);
      await db.prepare("DELETE FROM sessions WHERE admin_id=?").run(id);
      await db
        .prepare(
          "UPDATE invitations SET status='revoked' WHERE account_id=? AND status IN ('sending','sent','failed')",
        )
        .run(id);
      await audit(r.adminId, "staff.disabled", id);
    });
    return { ok: true };
  });
  app.post(P + "/invitations/:id/resend", async (r) => {
    fresh(r);
    const id = z.uuid().parse(r.params.id),
      a = await account(id);
    if (!a || a.protected) fail(403, "Kontoen kan ikke ændres.");
    const result = await invite(id, r.adminId, r);
    await stillAuthorized(r);
    return result;
  });
  app.post(P + "/invitations/:id/revoke", async (r) => {
    fresh(r);
    const id = z.uuid().parse(r.params.id),
      a = await account(id);
    if (!a || a.protected) fail(403, "Kontoen kan ikke ændres.");
    await db
      .prepare(
        "UPDATE invitations SET status='revoked' WHERE account_id=? AND status IN ('sending','sent','failed')",
      )
      .run(id);
    await db
      .prepare(
        "DELETE FROM registrations WHERE invitation_id IN (SELECT id FROM invitations WHERE account_id=?)",
      )
      .run(id);
    await audit(r.adminId, "invitation.revoked", id);
    return { ok: true };
  });
  app.get(P + "/customer/home", async (r) => {
    const c = await db
      .prepare("SELECT * FROM customers WHERE id=?")
      .get(r.session.customer_id);
    if (!c) fail(403, "Adgang nægtet.");
    return {
      name: r.session.name,
      allowance: c.allowance,
      expires: c.expires,
      projects: await db
        .prepare(
          "SELECT projects.id,projects.name,projects.description FROM assignments JOIN projects ON projects.id=assignments.project_id WHERE customer_id=? AND projects.enabled=1",
        )
        .all(c.id),
    };
  });
  return { invite, inviteMeta };
}
