import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { buildServer } from "../server/app.mjs";
import { openDatabase, asyncTransaction } from "../server/database.mjs";
import { openPostgres } from "../server/postgres.mjs";
import { migrate } from "../server/migrate.mjs";
import {
  token,
  digest,
  csrfFor,
  seal,
  unseal,
  hashPassword,
  verifyPassword,
  newOtpSecret,
  otp,
} from "../server/security.mjs";
import { replaceRecoveryCodes } from "../server/recovery.mjs";
import { issueSupportGrant } from "../server/recovery-support.mjs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backupPostgres, restorePostgres } from "../server/postgres-backup.mjs";
const origin = "https://recovery.example.test";
const pgUrl = (role) => {
  const u = new URL(process.env.TEST_DATABASE_URL);
  u.pathname = "/ai_recovery";
  u.username = role;
  return u.href;
};
async function fixture(t, backend, { mail = async () => true } = {}) {
  let now = Date.now();
  const key = randomBytes(32),
    messages = [];
  const owner =
    backend === "postgres"
      ? openPostgres(pgUrl("ai_migrator"))
      : openDatabase(":memory:");
  const asOwner = (fn) =>
    backend === "postgres"
      ? owner.transaction(async () => {
          await owner.query("SET LOCAL ROLE ai_owner");
          return fn();
        })
      : asyncTransaction(owner, fn);
  if (backend === "postgres") {
    assert.equal(new URL(pgUrl("ai_migrator")).pathname, "/ai_recovery");
    await asOwner(() =>
      owner.query(
        "DROP SCHEMA IF EXISTS private CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION ai_owner",
      ),
    );
    await migrate(owner);
  }
  const accounts = [];
  for (const [index, role] of ["customer", "admin", "admin"].entries()) {
    const id = randomUUID(),
      secret = newOtpSecret(),
      password = "Synthetic recovery password 2026!",
      sid = token(),
      customerId = role === "customer" ? randomUUID() : null;
    await asOwner(async () => {
      if (customerId)
        await owner
          .prepare("INSERT INTO customers VALUES(?,?,?,'active',NULL,100,?,?)")
          .run(
            customerId,
            "Synthetic customer",
            id + "@example.test",
            new Date(now).toISOString(),
            new Date(now).toISOString(),
          );
      await owner
        .prepare(
          "INSERT INTO admins(id,email,name,username,role,protected,status,password_hash,mfa_secret,created_at,customer_id) VALUES(?,?,?,?,?,?,'active',?,?,?,?)",
        )
        .run(
          id,
          id + "@example.test",
          "Synthetic " + index,
          "user-" + index,
          role,
          index === 2 ? 1 : 0,
          await hashPassword(password),
          seal(key, secret, "mfa:" + id),
          new Date(now).toISOString(),
          customerId,
        );
      await owner
        .prepare("INSERT INTO sessions VALUES(?,?,?,?,?,?)")
        .run(digest(sid), id, now, now, now + 43200000, now);
    });
    accounts.push({
      id,
      email: id + "@example.test",
      secret,
      password,
      customerId,
      headers: {
        cookie: "__Host-ai_session=" + sid,
        "x-csrf-token": csrfFor(key, sid),
      },
    });
  }
  const app = await buildServer({
    database:
      backend === "postgres" ? openPostgres(pgUrl("ai_control")) : owner,
    customerDatabase:
      backend === "postgres" ? openPostgres(pgUrl("ai_chat")) : undefined,
    vaultKey: key,
    origin,
    clock: () => now,
    mailer: async (message) => {
      messages.push(message);
      return mail(message);
    },
  });
  t.after(async () => {
    await app.close();
    if (backend === "postgres") await owner.close();
  });
  const request = (path, body, headers = {}, method = "POST") =>
    app.inject({
      url: path.startsWith("/") ? path : "/api/auth/recovery/" + path,
      method,
      headers: { origin, "content-type": "application/json", ...headers },
      ...(body === undefined ? {} : { payload: body }),
    });
  const readAccount = async (a) =>
    asOwner(() => owner.prepare("SELECT * FROM admins WHERE id=?").get(a.id));
  async function begin(a, lang = "en") {
    const sent = await request("request", { email: a.email, locale: lang });
    assert.equal(sent.statusCode, 200, sent.body);
    await app.recoveryIdle();
    const message = messages
      .filter((m) => m.to === a.email && m.text.includes("#recover="))
      .at(-1);
    assert.ok(message);
    const raw = message.text.match(/#recover=([A-Za-z0-9_-]{43})/)[1];
    const opened = await request("begin", { token: raw });
    assert.equal(opened.statusCode, 200, opened.body);
    const cookie = opened.cookies.find((c) => c.name === "__Host-ai_recovery");
    assert.ok(cookie.httpOnly && cookie.secure && cookie.path === "/");
    return {
      raw,
      headers: {
        cookie: cookie.name + "=" + cookie.value,
        "x-csrf-token": opened.json().csrf,
      },
    };
  }
  const codes = async (a) =>
    asOwner(() => replaceRecoveryCodes(owner, a.id, now));
  return {
    app,
    owner,
    asOwner,
    key,
    accounts,
    messages,
    request,
    begin,
    codes,
    readAccount,
    advance: (ms = 31000) => (now += ms),
    now: () => now,
  };
}
for (const backend of ["sqlite", "postgres"]) {
  const options = {
    skip: backend === "postgres" && !process.env.TEST_DATABASE_URL,
  };
  test(
    backend +
      ": password recovery preserves identities/MFA, requires the factor and revokes all sessions for Customers and both Admin identities",
    options,
    async (t) => {
      const f = await fixture(t, backend);
      for (const a of f.accounts) {
        const before = await f.readAccount(a),
          flow = await f.begin(a);
        const rejected = await f.request(
          "password",
          {
            newPassword: "Changed synthetic password 2026!",
            code: "not-an-otp",
          },
          flow.headers,
        );
        assert.equal(rejected.statusCode, 400);
        assert.equal(
          (await f.request("/api/auth/session", undefined, a.headers, "GET"))
            .statusCode,
          200,
        );
        const result = await f.request(
          "password",
          {
            newPassword: "Changed synthetic password 2026!",
            code: otp(a.secret).generate({ timestamp: f.now() }),
          },
          flow.headers,
        );
        assert.equal(result.statusCode, 200, result.body);
        const after = await f.readAccount(a);
        for (const field of [
          "id",
          "email",
          "username",
          "role",
          "protected",
          "status",
          "name",
          "customer_id",
          "mfa_secret",
        ])
          assert.equal(after[field], before[field]);
        assert.ok(
          await verifyPassword(
            "Changed synthetic password 2026!",
            after.password_hash,
          ),
        );
        assert.ok(after.last_step > before.last_step);
        assert.equal(
          (await f.request("/api/auth/session", undefined, a.headers, "GET"))
            .statusCode,
          401,
        );
        assert.equal(
          (
            await f.request(
              "password",
              {
                newPassword: "Another synthetic password 2026!",
                code: otp(a.secret).generate({ timestamp: f.now() }),
              },
              flow.headers,
            )
          ).statusCode,
          403,
        );
        const replay = await f.request("/api/auth/login", {
          email: a.email,
          password: "Changed synthetic password 2026!",
          code: otp(a.secret).generate({ timestamp: f.now() }),
        });
        assert.equal(replay.statusCode, 401);
        f.advance();
        const login = await f.request("/api/auth/login", {
          email: a.email,
          password: "Changed synthetic password 2026!",
          code: otp(a.secret).generate({ timestamp: f.now() }),
        });
        assert.equal(login.statusCode, 200, login.body);
        assert.equal(
          login.json().role,
          a === f.accounts[0] ? "Customer" : "Admin",
        );
        assert.ok(!/protected|Main Admin/.test(login.body));
      }
    },
  );
  test(
    backend +
      ": lost authenticator requires email+password+one-use code, enrolls a new factor and rotates codes for every role",
    options,
    async (t) => {
      const f = await fixture(t, backend);
      for (const a of f.accounts) {
        const before = await f.readAccount(a),
          saved = await f.codes(a),
          flow = await f.begin(a, "da");
        assert.equal(
          (await f.request("/api/account", undefined, flow.headers, "GET"))
            .statusCode,
          401,
        );
        const bad = await f.request(
          "authenticator",
          { password: "Wrong password", recoveryCode: saved[0] },
          flow.headers,
        );
        assert.equal(bad.statusCode, 400);
        const factor = await f.request(
          "authenticator",
          { password: a.password, recoveryCode: saved[0] },
          flow.headers,
        );
        assert.equal(factor.statusCode, 200, factor.body);
        assert.equal(
          (
            await f.request(
              "authenticator",
              { password: a.password, recoveryCode: saved[0] },
              flow.headers,
            )
          ).statusCode,
          400,
        );
        assert.equal((await f.readAccount(a)).mfa_secret, before.mfa_secret);
        const complete = await f.request(
          "complete",
          {
            newPassword: "New device password 2026!",
            code: otp(factor.json().secret).generate({ timestamp: f.now() }),
          },
          flow.headers,
        );
        assert.equal(complete.statusCode, 200, complete.body);
        assert.equal(complete.json().codes.length, 10);
        const after = await f.readAccount(a);
        assert.notEqual(after.mfa_secret, before.mfa_secret);
        assert.equal(after.id, before.id);
        assert.equal(after.protected, before.protected);
        assert.equal(after.customer_id, before.customer_id);
        assert.equal(
          unseal(f.key, after.mfa_secret, "mfa:" + a.id),
          factor.json().secret,
        );
        const stored = await f.asOwner(() =>
          f.owner
            .prepare("SELECT * FROM recovery_codes WHERE account_id=?")
            .all(a.id),
        );
        assert.equal(stored.length, 10);
        assert.ok(!JSON.stringify(stored).includes(complete.json().codes[0]));
        assert.equal(
          (await f.request("/api/auth/session", undefined, a.headers, "GET"))
            .statusCode,
          401,
        );
        assert.equal(
          (
            await f.request(
              "complete",
              {
                newPassword: "New device password 2026!",
                code: otp(factor.json().secret).generate({
                  timestamp: f.now(),
                }),
              },
              flow.headers,
            )
          ).statusCode,
          403,
        );
      }
    },
  );
  test(
    backend +
      ": recovery handles invalid/expired links, origins, CSRF, paused accounts and unknown mail identically",
    options,
    async (t) => {
      const f = await fixture(t, backend),
        a = f.accounts[0];
      const unknown = await f.request("request", {
          email: "absent@example.test",
          locale: "en",
        }),
        known = await f.request("request", { email: a.email, locale: "en" });
      assert.deepEqual(unknown.json(), known.json());
      assert.equal(known.headers["cache-control"], "no-store");
      await f.app.recoveryIdle();
      assert.equal(
        (
          await f.request(
            "request",
            { email: a.email, locale: "en" },
            { origin: "https://attacker.example.test" },
          )
        ).statusCode,
        403,
      );
      const raw = f.messages[0].text.match(/#recover=([A-Za-z0-9_-]{43})/)[1];
      assert.equal(
        (await f.request("begin", { token: token() })).statusCode,
        400,
      );
      const start = await f.request("begin", { token: raw }),
        cookie = start.cookies.find((c) => c.name === "__Host-ai_recovery");
      const headers = {
        cookie: cookie.name + "=" + cookie.value,
        "x-csrf-token": start.json().csrf,
      };
      assert.equal(
        (
          await f.request(
            "password",
            { newPassword: "New password for a fixture!", code: "000000" },
            { ...headers, "x-csrf-token": "wrong" },
          )
        ).statusCode,
        403,
      );
      f.advance(31 * 60000);
      assert.equal((await f.request("begin", { token: raw })).statusCode, 400);
      assert.equal(
        (
          await f.request(
            "password",
            { newPassword: "New password for a fixture!", code: "000000" },
            headers,
          )
        ).statusCode,
        403,
      );
      await f.asOwner(() =>
        f.owner
          .prepare("UPDATE admins SET status='paused' WHERE id=?")
          .run(a.id),
      );
      const previous = f.messages.length;
      assert.deepEqual(
        (await f.request("request", { email: a.email, locale: "en" })).json(),
        unknown.json(),
      );
      await f.app.recoveryIdle();
      assert.equal(f.messages.length, previous);
    },
  );
  test(
    backend +
      ": requests never wait for SMTP and failed delivery cannot create a usable grant",
    options,
    async (t) => {
      let release;
      const waiting = new Promise((resolve) => (release = resolve));
      const f = await fixture(t, backend, { mail: () => waiting }),
        a = f.accounts[0];
      const response = await f.request("request", {
        email: a.email,
        locale: "en",
      });
      assert.equal(response.statusCode, 200);
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(f.messages.length, 1);
      const raw = f.messages[0].text.match(/#recover=([A-Za-z0-9_-]{43})/)[1];
      assert.equal((await f.request("begin", { token: raw })).statusCode, 400);
      release(false);
      await f.app.recoveryIdle();
      assert.equal((await f.request("begin", { token: raw })).statusCode, 400);
    },
  );
  test(
    backend +
      ": proof failures persist across new browser grants and do not lock normal sign-in",
    options,
    async (t) => {
      const f = await fixture(t, backend),
        a = f.accounts[0],
        flow = await f.begin(a);
      for (let i = 0; i < 5; i++)
        assert.equal(
          (
            await f.request(
              "authenticator",
              { password: "wrong", recoveryCode: "X".repeat(39) },
              flow.headers,
            )
          ).statusCode,
          400,
        );
      const opened = await f.request("begin", { token: flow.raw }),
        cookie = opened.cookies.find((c) => c.name === "__Host-ai_recovery");
      assert.equal(
        (
          await f.request(
            "authenticator",
            { password: a.password, recoveryCode: "X".repeat(39) },
            {
              cookie: cookie.name + "=" + cookie.value,
              "x-csrf-token": opened.json().csrf,
            },
          )
        ).statusCode,
        429,
      );
      const login = await f.request("/api/auth/login", {
        email: a.email,
        password: a.password,
        code: otp(a.secret).generate({ timestamp: f.now() }),
      });
      assert.equal(login.statusCode, 200, login.body);
    },
  );
  test(
    backend +
      ": support grants are bound, expiring and one-use; staff cannot issue one or change another account through recovery",
    options,
    async (t) => {
      const f = await fixture(t, backend),
        a = f.accounts[2],
        b = f.accounts[0],
        flow = await f.begin(a),
        support = token();
      await f.asOwner(() =>
        f.owner
          .prepare("INSERT INTO recovery_support VALUES(?,?,?,?,?)")
          .run(
            randomUUID(),
            a.id,
            digest("support:" + a.id + ":" + support),
            f.now() + 600000,
            randomUUID(),
          ),
      );
      const bad = await f.request(
        "authenticator",
        { supportCode: token() },
        flow.headers,
      );
      assert.equal(bad.statusCode, 400);
      const accepted = await f.request(
        "authenticator",
        { supportCode: support },
        flow.headers,
      );
      assert.equal(accepted.statusCode, 200, accepted.body);
      assert.equal(
        (
          await f.request(
            "authenticator",
            { supportCode: support },
            flow.headers,
          )
        ).statusCode,
        400,
      );
      assert.equal(
        (
          await f.request(
            "/api/auth/codes",
            {
              password: b.password,
              code: otp(b.secret).generate({ timestamp: f.now() }),
              accountId: a.id,
            },
            b.headers,
          )
        ).statusCode,
        400,
      );
      if (backend === "postgres") {
        const control = openPostgres(pgUrl("ai_control"));
        try {
          await assert.rejects(
            control.query(
              "INSERT INTO recovery_support VALUES($1,$2,$3,$4,$5)",
              [
                randomUUID(),
                a.id,
                digest(token()),
                f.now() + 600000,
                randomUUID(),
              ],
            ),
            (e) => e.code === "42501",
          );
          await assert.rejects(
            issueSupportGrant(control, {
              email: a.email,
              caseRef: randomUUID(),
            }),
            /Maintenance operator/,
          );
        } finally {
          await control.close();
        }
        const chat = openPostgres(pgUrl("ai_chat"));
        try {
          await assert.rejects(
            chat.query("SELECT * FROM recovery_codes"),
            (e) => e.code === "42501",
          );
        } finally {
          await chat.close();
        }
      }
      assert.equal((await f.readAccount(a)).protected, 1);
      const completed = await f.request(
        "complete",
        {
          newPassword: "Support recovered password 2026!",
          code: otp(accepted.json().secret).generate({ timestamp: f.now() }),
        },
        flow.headers,
      );
      assert.equal(completed.statusCode, 200, completed.body);
      assert.equal((await f.readAccount(a)).protected, 1);
    },
  );
  test(
    backend +
      ": racing recovery completions consume a factor once and revoke pending links/cookies atomically",
    options,
    async (t) => {
      const f = await fixture(t, backend),
        a = f.accounts[1],
        flow = await f.begin(a),
        v = {
          newPassword: "Concurrent password for fixture!",
          code: otp(a.secret).generate({ timestamp: f.now() }),
        };
      const results = await Promise.all([
        f.request("password", v, flow.headers),
        f.request("password", v, flow.headers),
      ]);
      assert.equal(results.filter((r) => r.statusCode === 200).length, 1);
      assert.ok(results.some((r) => [400, 403].includes(r.statusCode)));
      const grants = await f.asOwner(() =>
        f.owner.prepare("SELECT * FROM recovery_sessions").all(),
      );
      assert.equal(grants.length, 0);
    },
  );
  test(
    backend +
      ": own recovery-code generation requires fresh proof, rotates hashes and exposes no other identity",
    options,
    async (t) => {
      const f = await fixture(t, backend),
        a = f.accounts[2],
        old = await f.codes(a);
      assert.equal(
        (await f.request("/api/auth/codes", undefined, a.headers, "GET")).json()
          .remaining,
        10,
      );
      assert.equal(
        (
          await f.request(
            "/api/auth/codes",
            {
              password: "wrong",
              code: otp(a.secret).generate({ timestamp: f.now() }),
            },
            a.headers,
          )
        ).statusCode,
        400,
      );
      const generated = await f.request(
        "/api/auth/codes",
        {
          password: a.password,
          code: otp(a.secret).generate({ timestamp: f.now() }),
        },
        a.headers,
      );
      assert.equal(generated.statusCode, 200, generated.body);
      assert.equal(generated.json().codes.length, 10);
      const stored = await f.asOwner(() =>
        f.owner
          .prepare("SELECT * FROM recovery_codes WHERE account_id=?")
          .all(a.id),
      );
      assert.ok(!JSON.stringify(stored).includes(old[0]));
      assert.ok(!JSON.stringify(stored).includes(generated.json().codes[0]));
      assert.equal(
        (
          await f.request(
            "/api/auth/codes",
            {
              password: a.password,
              code: otp(a.secret).generate({ timestamp: f.now() }),
            },
            a.headers,
          )
        ).statusCode,
        400,
      );
      assert.equal(
        (await f.request("/api/auth/codes", undefined, {}, "GET")).statusCode,
        401,
      );
      assert.equal(
        (
          await f.request(
            "/api/auth/codes",
            undefined,
            f.accounts[0].headers,
            "GET",
          )
        ).json().remaining,
        0,
      );
    },
  );
  test(
    backend +
      ": interrupted replacement and credential changes invalidate pending grants without changing the original factor",
    options,
    async (t) => {
      const f = await fixture(t, backend),
        a = f.accounts[0],
        before = await f.readAccount(a),
        codes = await f.codes(a),
        flow = await f.begin(a);
      const verified = await f.request(
        "authenticator",
        { password: a.password, recoveryCode: codes[0] },
        flow.headers,
      );
      assert.equal(verified.statusCode, 200);
      f.advance(11 * 60000);
      assert.equal(
        (
          await f.request(
            "complete",
            {
              newPassword: "Abandoned replacement password!",
              code: otp(verified.json().secret).generate({
                timestamp: f.now(),
              }),
            },
            flow.headers,
          )
        ).statusCode,
        403,
      );
      assert.equal((await f.readAccount(a)).mfa_secret, before.mfa_secret);
      const next = await f.begin(a);
      await f.asOwner(() =>
        f.owner
          .prepare("UPDATE admins SET password_hash=? WHERE id=?")
          .run("changed-credential-tag", a.id),
      );
      assert.equal(
        (
          await f.request(
            "password",
            {
              newPassword: "Another replacement password!",
              code: otp(a.secret).generate({ timestamp: f.now() }),
            },
            next.headers,
          )
        ).statusCode,
        400,
      );
    },
  );
}
test(
  "postgres: schema-8 upgrade and schema-9 restore preserve identities and invalidate all backed-up recovery factors",
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const f = await fixture(t, "postgres"),
      a = f.accounts[2],
      before = await f.readAccount(a);
    await f.asOwner(async () => {
      for (const table of [
        "recovery_sessions",
        "recovery_requests",
        "recovery_codes",
        "recovery_limits",
        "recovery_support",
      ])
        await f.owner.query(`DROP TABLE ${table}`);
      await f.owner.query("DELETE FROM schema_version WHERE version=9");
    });
    assert.equal((await migrate(f.owner)).schema, 9);
    assert.deepEqual(await f.readAccount(a), before);
    const issued = await issueSupportGrant(f.owner, {
      email: a.email,
      caseRef: randomUUID(),
      now: f.now(),
    });
    assert.ok(issued.code);
    const saved = await f.codes(a),
      flow = await f.begin(a);
    const dir = await mkdtemp(join(tmpdir(), "ai-recovery-schema-")),
      restUrl = new URL(pgUrl("ai_migrator"));
    restUrl.pathname = "/ai_recovery_restore";
    const restored = openPostgres(restUrl.href);
    try {
      await restored.transaction(async () => {
        await restored.query("SET LOCAL ROLE ai_owner");
        await restored.query(
          "DROP SCHEMA IF EXISTS private CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION ai_owner",
        );
      });
      await writeFile(join(dir, "vault.key"), f.key, { mode: 0o600 });
      await writeFile(join(dir, "deletions.jsonl"), "", { mode: 0o600 });
      await backupPostgres({
        databaseUrl: pgUrl("ai_migrator"),
        state: dir,
        destination: join(dir, "backup"),
      });
      assert.equal(
        (
          await f.request(
            "authenticator",
            { password: a.password, recoveryCode: saved[0] },
            flow.headers,
          )
        ).statusCode,
        200,
      );
      await restorePostgres({
        databaseUrl: restUrl.href,
        backup: join(dir, "backup"),
        journal: join(dir, "deletions.jsonl"),
      });
      await restored.transaction(async () => {
        await restored.query("SET LOCAL ROLE ai_owner");
        for (const table of [
          "recovery_codes",
          "recovery_requests",
          "recovery_sessions",
          "recovery_support",
          "sessions",
        ])
          assert.equal(
            (await restored.query(`SELECT count(*) AS n FROM ${table}`)).rows[0]
              .n,
            0,
          );
        const account = (
          await restored.query("SELECT * FROM admins WHERE id=$1", [a.id])
        ).rows[0];
        assert.equal(account.password_hash, before.password_hash);
        assert.equal(account.mfa_secret, before.mfa_secret);
        assert.equal(account.protected, 1);
      });
    } finally {
      await restored.close();
      await rm(dir, { recursive: true, force: true });
    }
  },
);
