import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import serveStatic from "@fastify/static";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { openDatabase, transaction } from "./database.mjs";
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
import { installAccounts, username } from "./accounts.mjs";
import { translate } from "./messages.mjs";
import { checkOpenAI } from "./provider.mjs";

const P = "/backoffice/api",
  SID = "bo_session",
  SETUP = "bo_setup";
const text = (max) => z.string().trim().min(1).max(max);
const email = z
  .email()
  .max(254)
  .transform((s) => s.toLowerCase());
const code = z.string().regex(/^\d{6}$/);
const password = z.string().min(14).max(256);
const projectRef = z.string().regex(/^proj_[A-Za-z0-9_-]{3,100}$/);
const keyInput = z
  .string()
  .min(25)
  .max(512)
  .regex(/^sk-proj-[A-Za-z0-9_-]+$/);
const customerInput = z
  .object({
    name: text(100),
    email,
    locale: z.enum(["en", "da"]).default("da"),
    status: z.enum(["pending", "active", "paused"]),
    expires: z.iso.date().nullable(),
    allowance: z.int().min(0).max(1000000),
    assignments: z
      .array(z.object({ projectId: z.uuid(), versionId: z.uuid() }).strict())
      .max(100),
  })
  .strict();
const projectInput = z
  .object({
    name: text(80),
    description: z.string().trim().max(1000),
    connectionId: z.uuid().nullable(),
    enabled: z.boolean(),
  })
  .strict();
const connectionInput = z
  .object({
    label: text(80),
    projectRef,
    environment: z.enum(["test", "production"]),
    apiKey: keyInput,
  })
  .strict();
class Problem extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new Problem(status, message);
};

export async function buildServer({
  dbPath = ":memory:",
  vaultKey,
  origin,
  localOrigin = "http://127.0.0.1:8765",
  secureCookies = true,
  staticRoot,
  clock = Date.now,
  providerCheck = checkOpenAI,
  bootstrapHash,
  passwordCheck = verifyPassword,
  mailer = async () => false,
}) {
  if (!Buffer.isBuffer(vaultKey) || vaultKey.length !== 32)
    throw new Error("A 32-byte vault key is required");
  const configured = new URL(origin);
  if (
    configured.origin !== origin ||
    (!secureCookies && origin !== localOrigin)
  )
    throw new Error("Invalid service origin/cookie configuration");
  const app = Fastify({
    logger: false,
    bodyLimit: 96 * 1024,
    trustProxy: false,
    requestTimeout: 20000,
  });
  const db = openDatabase(dbPath);
  app.decorate("db", db);
  app.addHook("onClose", () => db.close());
  await app.register(cookie);
  // Use the socket identity, not user-controlled proxy/IP headers. Per-account
  // failure limits below persist across process restarts.
  await app.register(rateLimit, {
    max: 240,
    timeWindow: "1 minute",
    keyGenerator: (r) => r.socket.remoteAddress || "local",
  });
  const dummyPassword = await hashPassword(token());
  const stamp = () => new Date(clock()).toISOString();
  const audit = (admin, action, target) =>
    db
      .prepare("INSERT INTO audit VALUES(?,?,?,?,?)")
      .run(randomUUID(), admin, action, target, stamp());
  const cookieOptions = {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "strict",
    path: "/backoffice",
    maxAge: 12 * 60 * 60,
  };
  const ownerExists = () => !!db.prepare("SELECT id FROM admins LIMIT 1").get();
  const localSetup = (r) =>
    !ownerExists() &&
    typeof r.headers["x-setup-token"] === "string" &&
    typeof bootstrapHash === "string" &&
    equal(digest(r.headers["x-setup-token"]), bootstrapHash) &&
    r.headers.host === new URL(localOrigin).host &&
    ["127.0.0.1", "::1"].includes(r.socket.remoteAddress) &&
    !Object.keys(r.headers).some(
      (h) => h.startsWith("x-forwarded-") || h === "forwarded",
    ) &&
    (!r.headers.origin || r.headers.origin === localOrigin);
  const consumeOtp = (admin, value) => {
    const step = otpStep(
      unseal(vaultKey, admin.mfa_secret, "mfa:" + admin.id),
      value,
      clock(),
    );
    if (step === null || step <= admin.last_step) return false;
    return (
      db
        .prepare(
          "UPDATE admins SET last_step=? WHERE id=? AND last_step<? AND password_hash=? AND status='active'",
        )
        .run(step, admin.id, step, admin.password_hash).changes === 1
    );
  };
  const activeAccount = (id) =>
    db
      .prepare(
        `SELECT admins.* FROM admins LEFT JOIN customers ON customers.id=admins.customer_id
    WHERE admins.id=? AND admins.status='active' AND (admins.role='admin' OR (customers.status='active' AND (customers.expires IS NULL OR customers.expires>=?)))`,
      )
      .get(id, new Date(clock()).toISOString().slice(0, 10));
  const sessionDto = (a, sid) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    username: a.username,
    locale: a.locale,
    role: a.role === "admin" ? "Admin" : "Customer",
    csrf: csrfFor(vaultKey, sid),
  });
  const stillAuthorized = (r) => {
    const live = db
      .prepare("SELECT * FROM sessions WHERE hash=?")
      .get(r.session.hash);
    if (
      !live ||
      !activeAccount(live.admin_id) ||
      live.expires <= clock() ||
      live.seen + 30 * 60 * 1000 <= clock()
    )
      fail(401, "Log ind for at fortsætte.");
  };
  const fresh = (r) => {
    if (clock() - r.session.mfa_at > 10 * 60 * 1000)
      fail(403, "Bekræft en ny kode fra din authenticator først.");
  };
  app.addHook("onRequest", async (r, reply) => {
    reply.headers({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Security-Policy":
        "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
    });
    const path = r.url.split("?")[0];
    if (!path.startsWith(P + "/")) return;
    const setup = path === P + "/setup";
    if (setup) {
      if (!localSetup(r)) fail(404, "Siden findes ikke.");
      return;
    }
    if (
      !["GET", "HEAD"].includes(r.method) &&
      (r.headers.origin !== origin ||
        !r.headers["content-type"]?.startsWith("application/json"))
    )
      fail(403, "Anmodningen blev afvist. Genindlæs siden.");
    if (
      [
        P + "/auth/login",
        P + "/register/begin",
        P + "/register/complete",
      ].includes(path)
    )
      return;
    const sid = r.cookies[SID];
    const session =
      sid &&
      db
        .prepare(
          "SELECT sessions.*,admins.name,admins.email,admins.username,admins.role,admins.locale,admins.customer_id FROM sessions JOIN admins ON admins.id=sessions.admin_id WHERE hash=?",
        )
        .get(digest(sid));
    if (
      !session ||
      !activeAccount(session.admin_id) ||
      session.expires <= clock() ||
      session.seen + 30 * 60 * 1000 <= clock()
    ) {
      if (sid) db.prepare("DELETE FROM sessions WHERE hash=?").run(digest(sid));
      reply.clearCookie(SID, cookieOptions);
      fail(401, "Log ind for at fortsætte.");
    }
    const common = [
      "/auth/session",
      "/auth/logout",
      "/auth/password",
      "/auth/reauth",
    ];
    if (
      session.role !== "admin" &&
      !common.some((p) => path === P + p) &&
      path !== P + "/customer/home"
    )
      fail(403, "Adgang nægtet.");
    if (session.role === "admin" && path === P + "/customer/home")
      fail(403, "Adgang nægtet.");
    r.session = session;
    r.adminId = session.admin_id;
    r.sessionId = sid;
    if (
      !["GET", "HEAD"].includes(r.method) &&
      !equal(r.headers["x-csrf-token"], csrfFor(vaultKey, sid))
    )
      fail(403, "Anmodningen blev afvist. Genindlæs siden.");
    db.prepare("UPDATE sessions SET seen=? WHERE hash=?").run(
      clock(),
      session.hash,
    );
  });
  app.addHook("onSend", async (r, reply, payload) => {
    if (
      r.url.startsWith(P + "/") &&
      reply.getHeader("content-type")?.includes("application/json") &&
      typeof payload === "string"
    ) {
      const body = JSON.parse(payload);
      if (typeof body.message === "string") {
        body.messageKey = body.message;
        body.message = translate(
          body.message,
          r.headers["accept-language"]?.startsWith("en") ? "en" : "da",
        );
        return JSON.stringify(body);
      }
    }
    return payload;
  });
  app.setErrorHandler((error, r, reply) => {
    if (error instanceof Problem)
      return reply.code(error.status).send({ message: error.message });
    if (error instanceof z.ZodError)
      return reply.code(400).send({
        message:
          "Kontrollér felterne. Navne, e-mail, datoer og referencer skal være gyldige.",
      });
    if (
      error.code?.startsWith("SQLITE_CONSTRAINT") ||
      (Number.isInteger(error.errcode) && (error.errcode & 255) === 19)
    )
      return reply.code(409).send({
        message:
          "Oplysningerne er allerede i brug eller refererer til en post, der ikke findes.",
      });
    if (error.statusCode === 429)
      return reply
        .code(429)
        .send({ message: "For mange forsøg. Vent lidt og prøv igen." });
    if (error.statusCode && error.statusCode < 500)
      return reply
        .code(error.statusCode)
        .send({ message: "Anmodningen kunne ikke læses." });
    // Deliberately exclude bodies, headers, provider responses and SQL bindings.
    return reply
      .code(500)
      .send({ message: "Handlingen kunne ikke gennemføres. Prøv igen." });
  });
  app.get(P + "/setup", async (r, reply) => {
    const secret = newOtpSecret(),
      sid = token();
    db.prepare("DELETE FROM setup_sessions WHERE expires<=?").run(clock());
    db.prepare("INSERT INTO setup_sessions VALUES(?,?,?)").run(
      digest(sid),
      seal(vaultKey, secret, "setup:" + digest(sid)),
      clock() + 10 * 60 * 1000,
    );
    reply.setCookie(SETUP, sid, {
      httpOnly: true,
      secure: false,
      sameSite: "strict",
      path: P + "/setup",
      maxAge: 600,
    });
    return {
      secret,
      uri: otp(secret).toString(),
      csrf: csrfFor(vaultKey, sid),
      identity:
        db
          .prepare(
            "SELECT name,email,username FROM owner_identity WHERE singleton=1",
          )
          .get() || null,
    };
  });
  app.post(P + "/setup", async (r, reply) => {
    if (
      r.headers.origin !== localOrigin ||
      !r.headers["content-type"]?.startsWith("application/json")
    )
      fail(403, "Anmodningen blev afvist.");
    const sid = r.cookies[SETUP],
      session =
        sid &&
        db
          .prepare("SELECT * FROM setup_sessions WHERE hash=?")
          .get(digest(sid));
    if (
      !session ||
      session.expires <= clock() ||
      !equal(r.headers["x-csrf-token"], csrfFor(vaultKey, sid))
    )
      fail(403, "Opsætningen er udløbet. Genindlæs siden.");
    const input = z
      .object({
        name: text(100),
        email,
        username: username.optional(),
        password,
        code,
      })
      .strict()
      .parse(r.body);
    const enforceReservation = () => {
      const identity = db
        .prepare("SELECT * FROM owner_identity WHERE singleton=1")
        .get();
      if (
        identity &&
        (input.email !== identity.email ||
          input.username !== identity.username ||
          input.name !== identity.name)
      )
        fail(403, "Brug den reserverede konto i den private opsætning.");
    };
    enforceReservation();
    const secret = unseal(vaultKey, session.secret, "setup:" + session.hash);
    const step = otpStep(secret, input.code, clock());
    if (step === null)
      fail(
        400,
        "Koden blev ikke godkendt. Kontrollér din authenticator og telefonens klokkeslæt.",
      );
    const id = randomUUID(),
      hash = await hashPassword(input.password);
    transaction(db, () => {
      if (ownerExists()) fail(409, "Administrationen er allerede oprettet.");
      const liveSetup = db
        .prepare("SELECT expires FROM setup_sessions WHERE hash=?")
        .get(session.hash);
      if (!liveSetup || liveSetup.expires <= clock())
        fail(403, "Opsætningen er udløbet. Genindlæs siden.");
      enforceReservation();
      db.prepare(
        "INSERT INTO admins(id,email,name,password_hash,mfa_secret,last_step,created_at,username,protected) VALUES(?,?,?,?,?,?,?,?,1)",
      ).run(
        id,
        input.email,
        input.name,
        hash,
        seal(vaultKey, secret, "mfa:" + id),
        step,
        stamp(),
        input.username || null,
      );
      db.prepare("DELETE FROM setup_sessions").run();
      audit(id, "admin.enrolled", id);
    });
    reply.clearCookie(SETUP, { path: P + "/setup" });
    return {
      message:
        "Administratoren er oprettet. Log ind med en ny authenticator-kode.",
      loginUrl: origin + "/backoffice/",
    };
  });
  app.post(
    P + "/auth/login",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (r, reply) => {
      const input = z
        .object({
          email: text(254).transform((v) => v.toLowerCase()),
          password: z.string().min(1).max(256),
          code,
        })
        .strict()
        .parse(r.body);
      const admin = db
        .prepare("SELECT * FROM admins WHERE email=? OR username=?")
        .get(input.email, input.email);
      const bucket = digest(admin?.id || input.email),
        attempt = db
          .prepare("SELECT * FROM login_failures WHERE bucket=?")
          .get(bucket);
      if (attempt && attempt.reset_at > clock() && attempt.failures >= 5)
        fail(429, "For mange loginforsøg. Prøv igen om ti minutter.");
      const valid = await passwordCheck(
        input.password,
        admin?.password_hash || dummyPassword,
      );
      if (
        !valid ||
        !admin ||
        !activeAccount(admin.id) ||
        !consumeOtp(admin, input.code)
      ) {
        db.prepare(
          "INSERT INTO login_failures VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET failures=CASE WHEN reset_at<=? THEN 1 ELSE failures+1 END,reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END",
        ).run(bucket, clock() + 10 * 60 * 1000, clock(), clock());
        fail(
          401,
          "Login blev ikke godkendt. Kontrollér e-mail, adgangskode og en ny authenticator-kode.",
        );
      }
      const sid = token();
      transaction(db, () => {
        if (r.cookies[SID])
          db.prepare("DELETE FROM sessions WHERE hash=?").run(
            digest(r.cookies[SID]),
          );
        db.prepare("DELETE FROM login_failures WHERE bucket=?").run(bucket);
        db.prepare("DELETE FROM sessions WHERE expires<=? OR seen<=?").run(
          clock(),
          clock() - 30 * 60 * 1000,
        );
        db.prepare("INSERT INTO sessions VALUES(?,?,?,?,?,?)").run(
          digest(sid),
          admin.id,
          clock(),
          clock(),
          clock() + 12 * 60 * 60 * 1000,
          clock(),
        );
        audit(admin.id, "admin.login", admin.id);
      });
      reply.setCookie(SID, sid, cookieOptions);
      return sessionDto(admin, sid);
    },
  );
  app.get(P + "/auth/session", async (r) => sessionDto(r.session, r.sessionId));
  app.post(P + "/auth/logout", async (r, reply) => {
    db.prepare("DELETE FROM sessions WHERE hash=?").run(r.session.hash);
    audit(r.adminId, "admin.logout", r.adminId);
    reply.clearCookie(SID, cookieOptions);
    return { ok: true };
  });
  app.post(
    P + "/auth/reauth",
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (r) => {
      const { code: value } = z.object({ code }).strict().parse(r.body);
      const admin = db
        .prepare("SELECT * FROM admins WHERE id=?")
        .get(r.adminId);
      if (!consumeOtp(admin, value))
        fail(401, "Brug en ny kode fra din authenticator.");
      db.prepare("UPDATE sessions SET mfa_at=? WHERE hash=?").run(
        clock(),
        r.session.hash,
      );
      audit(r.adminId, "admin.reauthenticated", r.adminId);
      return { ok: true };
    },
  );
  app.post(
    P + "/auth/password",
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (r, reply) => {
      const v = z
        .object({
          currentPassword: z.string().min(1).max(256),
          newPassword: password,
          code,
        })
        .strict()
        .parse(r.body);
      const admin = db
        .prepare("SELECT * FROM admins WHERE id=?")
        .get(r.adminId);
      if (
        !(await verifyPassword(v.currentPassword, admin.password_hash)) ||
        !consumeOtp(admin, v.code)
      )
        fail(400, "Adgangskoden eller authenticator-koden blev ikke godkendt.");
      const hash = await hashPassword(v.newPassword);
      transaction(db, () => {
        stillAuthorized(r);
        db.prepare("UPDATE admins SET password_hash=? WHERE id=?").run(
          hash,
          r.adminId,
        );
        db.prepare("DELETE FROM sessions WHERE admin_id=?").run(r.adminId);
        audit(r.adminId, "admin.password_changed", r.adminId);
      });
      reply.clearCookie(SID, cookieOptions);
      return { ok: true };
    },
  );
  const accounts = installAccounts(app, {
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
  });
  app.get(P + "/overview", async () => ({
    customers: db.prepare("SELECT count(*) AS n FROM customers").get().n,
    projects: db.prepare("SELECT count(*) AS n FROM projects").get().n,
    connections: db.prepare("SELECT count(*) AS n FROM connections").get().n,
  }));
  app.get(P + "/customers", async () =>
    db
      .prepare("SELECT * FROM customers ORDER BY created_at DESC")
      .all()
      .map((c) => ({
        ...c,
        account: (() => {
          const a = db
            .prepare(
              "SELECT id,status,username,locale FROM admins WHERE customer_id=?",
            )
            .get(c.id);
          return a ? { ...a, invitation: accounts.inviteMeta(a.id) } : null;
        })(),
        assignments: db
          .prepare(
            "SELECT project_id AS projectId,version_id AS versionId FROM assignments WHERE customer_id=?",
          )
          .all(c.id),
      })),
  );
  async function saveCustomer(r, id, create) {
    const v = customerInput.parse(r.body);
    if (
      new Set(v.assignments.map((a) => a.projectId)).size !==
      v.assignments.length
    )
      fail(400, "Vælg kun én promptversion pr. projekt.");
    const accountId = create
      ? randomUUID()
      : db.prepare("SELECT id FROM admins WHERE customer_id=?").get(id)?.id;
    transaction(db, () => {
      const currentAccount =
        accountId &&
        db.prepare("SELECT * FROM admins WHERE id=?").get(accountId);
      if (currentAccount && currentAccount.email !== v.email)
        fail(400, "E-mail kan ikke ændres efter invitationen.");
      if (create) {
        db.prepare("INSERT INTO customers VALUES(?,?,?,?,?,?,?,?)").run(
          id,
          v.name,
          v.email,
          v.status,
          v.expires,
          v.allowance,
          stamp(),
          stamp(),
        );
        db.prepare(
          "INSERT INTO admins(id,email,name,password_hash,mfa_secret,last_step,created_at,role,status,locale,customer_id) VALUES(?,?,?,'','',-1,?,'customer','pending',?,?)",
        ).run(accountId, v.email, v.name, stamp(), v.locale, id);
      } else {
        if (
          !db
            .prepare(
              "UPDATE customers SET name=?,email=?,status=?,expires=?,allowance=?,updated_at=? WHERE id=?",
            )
            .run(v.name, v.email, v.status, v.expires, v.allowance, stamp(), id)
            .changes
        )
          fail(404, "Kunden findes ikke.");
        db.prepare("DELETE FROM assignments WHERE customer_id=?").run(id);
        if (accountId) {
          db.prepare("UPDATE admins SET name=?,locale=? WHERE id=?").run(
            v.name,
            v.locale,
            accountId,
          );
          if (v.status !== "active")
            db.prepare("DELETE FROM sessions WHERE admin_id=?").run(accountId);
        }
      }
      for (const a of v.assignments)
        db.prepare("INSERT INTO assignments VALUES(?,?,?)").run(
          id,
          a.projectId,
          a.versionId,
        );
      audit(r.adminId, create ? "customer.created" : "customer.updated", id);
    });
    const result = create ? await accounts.invite(accountId, r.adminId) : {};
    if (create) stillAuthorized(r);
    return { id, ...result };
  }
  app.post(P + "/customers", async (r) => saveCustomer(r, randomUUID(), true));
  app.put(P + "/customers/:id", async (r) =>
    saveCustomer(r, z.uuid().parse(r.params.id), false),
  );
  const connectionMetadata =
    "id,label,project_ref,environment,suffix,revision,enabled,status,last_checked,created_at,updated_at";
  app.get(P + "/connections", async () =>
    db
      .prepare(
        `SELECT ${connectionMetadata} FROM connections ORDER BY created_at DESC`,
      )
      .all(),
  );
  app.post(P + "/connections", async (r) => {
    fresh(r);
    const v = connectionInput.parse(r.body),
      id = randomUUID();
    const result = await providerCheck(v.apiKey, v.projectRef);
    stillAuthorized(r);
    fresh(r);
    if (result !== "ok") fail(400, connectionError(result));
    transaction(db, () => {
      db.prepare("INSERT INTO connections VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(
        id,
        v.label,
        v.projectRef,
        v.environment,
        seal(vaultKey, v.apiKey, "connection:" + id),
        v.apiKey.slice(-4),
        1,
        1,
        "ok",
        stamp(),
        stamp(),
        stamp(),
      );
      audit(r.adminId, "connection.created", id);
    });
    return { id };
  });
  app.put(P + "/connections/:id", async (r) => {
    fresh(r);
    const id = z.uuid().parse(r.params.id),
      v = z
        .object({
          label: text(80),
          enabled: z.boolean(),
          revision: z.int().min(1),
        })
        .strict()
        .parse(r.body);
    transaction(db, () => {
      if (
        !db
          .prepare(
            "UPDATE connections SET label=?,enabled=?,updated_at=? WHERE id=? AND revision=?",
          )
          .run(v.label, Number(v.enabled), stamp(), id, v.revision).changes
      )
        fail(409, "Forbindelsen er ændret. Genindlæs og prøv igen.");
      audit(
        r.adminId,
        v.enabled ? "connection.updated" : "connection.paused",
        id,
      );
    });
    return { ok: true };
  });
  app.post(
    P + "/connections/:id/check",
    { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } },
    async (r) => {
      const id = z.uuid().parse(r.params.id),
        c = db.prepare("SELECT * FROM connections WHERE id=?").get(id);
      if (!c) fail(404, "Forbindelsen findes ikke.");
      if (!c.enabled) fail(409, "Aktivér forbindelsen før kontrol.");
      const status = await providerCheck(
        unseal(vaultKey, c.key_secret, "connection:" + id),
        c.project_ref,
      );
      stillAuthorized(r);
      transaction(db, () => {
        if (
          !db
            .prepare(
              "UPDATE connections SET status=?,last_checked=?,updated_at=? WHERE id=? AND revision=? AND enabled=1",
            )
            .run(status, stamp(), stamp(), id, c.revision).changes
        )
          fail(409, "Forbindelsen er ændret under kontrollen.");
        audit(r.adminId, "connection.checked." + status, id);
      });
      return {
        status,
        message:
          status === "ok"
            ? "Forbindelsen har adgang til modellisten."
            : connectionError(status),
      };
    },
  );
  app.post(P + "/connections/:id/rotate", async (r) => {
    fresh(r);
    const id = z.uuid().parse(r.params.id),
      v = z
        .object({ apiKey: keyInput, revision: z.int().min(1) })
        .strict()
        .parse(r.body);
    const c = db.prepare("SELECT * FROM connections WHERE id=?").get(id);
    if (!c) fail(404, "Forbindelsen findes ikke.");
    if (c.revision !== v.revision)
      fail(409, "Forbindelsen er ændret. Genindlæs først.");
    const result = await providerCheck(v.apiKey, c.project_ref);
    stillAuthorized(r);
    fresh(r);
    if (result !== "ok")
      fail(
        400,
        connectionError(result) + " Den eksisterende nøgle er bevaret.",
      );
    transaction(db, () => {
      if (
        !db
          .prepare(
            "UPDATE connections SET key_secret=?,suffix=?,revision=revision+1,status=?,last_checked=?,updated_at=? WHERE id=? AND revision=?",
          )
          .run(
            seal(vaultKey, v.apiKey, "connection:" + id),
            v.apiKey.slice(-4),
            "ok",
            stamp(),
            stamp(),
            id,
            v.revision,
          ).changes
      )
        fail(409, "Forbindelsen er ændret under kontrollen.");
      audit(r.adminId, "connection.rotated", id);
    });
    return { ok: true };
  });
  app.get(P + "/projects", async () =>
    db.prepare("SELECT * FROM projects ORDER BY name").all(),
  );
  function saveProject(r, id, create) {
    const v = projectInput.parse(r.body);
    transaction(db, () => {
      if (create)
        db.prepare("INSERT INTO projects VALUES(?,?,?,?,?,?,?)").run(
          id,
          v.name,
          v.description,
          v.connectionId,
          Number(v.enabled),
          stamp(),
          stamp(),
        );
      else {
        const previous = db
          .prepare("SELECT connection_id FROM projects WHERE id=?")
          .get(id);
        if (!previous) fail(404, "Projektet findes ikke.");
        if (
          previous.connection_id !== null &&
          previous.connection_id !== v.connectionId &&
          db
            .prepare(
              "SELECT id FROM prompt_versions WHERE project_id=? LIMIT 1",
            )
            .get(id)
        )
          fail(
            409,
            "Projektet har promptversioner. Opret et nyt projekt ved skift til en anden OpenAI-forbindelse.",
          );
        db.prepare(
          "UPDATE projects SET name=?,description=?,connection_id=?,enabled=?,updated_at=? WHERE id=?",
        ).run(
          v.name,
          v.description,
          v.connectionId,
          Number(v.enabled),
          stamp(),
          id,
        );
      }
      audit(r.adminId, create ? "project.created" : "project.updated", id);
    });
    return { id };
  }
  app.post(P + "/projects", async (r) => saveProject(r, randomUUID(), true));
  app.put(P + "/projects/:id", async (r) =>
    saveProject(r, z.uuid().parse(r.params.id), false),
  );
  app.get(P + "/prompts", async () =>
    db
      .prepare(
        "SELECT id,project_id,prompt_id,name,version,source_ref,checksum,created_at FROM prompt_versions ORDER BY name,version DESC",
      )
      .all(),
  );
  app.post(P + "/prompts", async (r) => {
    const v = z
      .object({
        projectId: z.uuid(),
        promptId: z.uuid().nullable(),
        name: text(80),
        instructions: text(48000),
        sourceRef: z.string().trim().max(150),
      })
      .strict()
      .parse(r.body);
    const id = randomUUID(),
      promptId = v.promptId || randomUUID();
    transaction(db, () => {
      if (
        v.promptId &&
        !db
          .prepare(
            "SELECT id FROM prompt_versions WHERE project_id=? AND prompt_id=?",
          )
          .get(v.projectId, promptId)
      )
        fail(400, "Vælg en prompt fra det samme projekt.");
      if (
        !v.promptId &&
        db
          .prepare(
            "SELECT id FROM prompt_versions WHERE project_id=? AND name=? COLLATE NOCASE",
          )
          .get(v.projectId, v.name)
      )
        fail(409, "Opret en ny version af den eksisterende prompt.");
      const version = db
        .prepare(
          "SELECT coalesce(max(version),0)+1 AS next FROM prompt_versions WHERE project_id=? AND prompt_id=?",
        )
        .get(v.projectId, promptId).next;
      db.prepare("INSERT INTO prompt_versions VALUES(?,?,?,?,?,?,?,?,?)").run(
        id,
        v.projectId,
        promptId,
        v.name,
        version,
        seal(vaultKey, v.instructions, "prompt:" + id),
        v.sourceRef,
        digest(v.instructions),
        stamp(),
      );
      audit(r.adminId, "prompt.version_created", id);
    });
    return { id };
  });
  app.get(P + "/prompts/:id", async (r) => {
    const id = z.uuid().parse(r.params.id),
      p = db.prepare("SELECT * FROM prompt_versions WHERE id=?").get(id);
    if (!p) fail(404, "Prompten findes ikke.");
    audit(r.adminId, "prompt.viewed", id);
    return {
      ...p,
      instructions: unseal(vaultKey, p.instructions, "prompt:" + id),
    };
  });
  app.get(P + "/audit", async () =>
    db
      .prepare(
        "SELECT audit.*,admins.name AS administrator FROM audit LEFT JOIN admins ON admins.id=audit.admin_id ORDER BY created_at DESC LIMIT 100",
      )
      .all(),
  );
  app.get("/backoffice/health.json", async () => {
    db.prepare("SELECT 1").get();
    return {
      status: "ok",
      application: "kundetypeassistent-backoffice",
      stage: "administration",
      revision: process.env.APP_REVISION || "local",
    };
  });
  if (staticRoot)
    await app.register(serveStatic, {
      root: staticRoot,
      prefix: "/backoffice/",
      index: "index.html",
      cacheControl: false,
    });
  app.setNotFoundHandler((r, reply) =>
    reply.code(404).send({ message: "Siden findes ikke." }),
  );
  await app.ready();
  return app;
}
function connectionError(status) {
  return (
    {
      invalid: "Nøglen blev afvist af OpenAI.",
      restricted:
        "Nøglen mangler adgang til modellisten eller det angivne projekt.",
      rate_limited: "OpenAI begrænser anmodninger lige nu. Prøv igen senere.",
      error: "OpenAI kunne ikke kontaktes. Prøv igen senere.",
    }[status] || "Forbindelsen kunne ikke kontrolleres."
  );
}
