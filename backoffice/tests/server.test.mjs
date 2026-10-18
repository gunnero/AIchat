import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "../server/app.mjs";
import { otp, unseal, seal, digest } from "../server/security.mjs";
import { checkOpenAI } from "../server/provider.mjs";

const origin = "https://admin.example.test",
  localOrigin = "http://127.0.0.1:8765";
const fixtureKey = "sk-proj-" + "synthetic_test_only_".repeat(5);
const fixturePassword = "A synthetic test password 2026!";
async function fixture(
  t,
  {
    providerCheck = async () => "ok",
    dbPath = ":memory:",
    vaultKey = randomBytes(32),
  } = {},
) {
  let now = Date.UTC(2026, 9, 18, 12, 0, 0);
  const app = await buildServer({
    dbPath,
    vaultKey,
    origin,
    localOrigin,
    clock: () => now,
    providerCheck,
    bootstrapHash: digest("synthetic-owner-enrollment-token"),
  });
  t.after(() => app.close());
  let cookie = "",
    csrf = "",
    secret = "";
  async function req(path, method = "GET", payload, headers = {}) {
    return app.inject({
      url: "/backoffice/api" + path,
      method,
      payload,
      headers: {
        origin,
        ...(cookie ? { cookie } : {}),
        ...(method !== "GET"
          ? { "content-type": "application/json", "x-csrf-token": csrf }
          : {}),
        ...headers,
      },
    });
  }
  async function setup() {
    const r = await req("/setup", "GET", undefined, {
      host: "127.0.0.1:8765",
      origin: localOrigin,
      "x-setup-token": "synthetic-owner-enrollment-token",
    });
    assert.equal(r.statusCode, 200);
    secret = r.json().secret;
    const c = r.cookies[0].name + "=" + r.cookies[0].value;
    const result = await req(
      "/setup",
      "POST",
      {
        name: "Test administrator",
        email: "admin@example.test",
        password: fixturePassword,
        code: otp(secret).generate({ timestamp: now }),
      },
      {
        host: "127.0.0.1:8765",
        origin: localOrigin,
        "x-setup-token": "synthetic-owner-enrollment-token",
        cookie: c,
        "x-csrf-token": r.json().csrf,
      },
    );
    assert.equal(result.statusCode, 200);
    now += 30000;
  }
  async function login() {
    const r = await req("/auth/login", "POST", {
      email: "admin@example.test",
      password: fixturePassword,
      code: otp(secret).generate({ timestamp: now }),
    });
    assert.equal(r.statusCode, 200);
    cookie =
      r.cookies.find((c) => c.name === "bo_session").name +
      "=" +
      r.cookies.find((c) => c.name === "bo_session").value;
    csrf = r.json().csrf;
    return r;
  }
  async function owner() {
    await setup();
    await login();
  }
  async function connection() {
    const r = await req("/connections", "POST", {
      label: "Test connection",
      projectRef: "proj_synthetic_test",
      environment: "test",
      apiKey: fixtureKey,
    });
    assert.equal(r.statusCode, 200);
    return r.json().id;
  }
  async function project(name = "Test project", connectionId = null) {
    const r = await req("/projects", "POST", {
      name,
      description: "Synthetic project",
      connectionId,
      enabled: true,
    });
    assert.equal(r.statusCode, 200);
    return r.json().id;
  }
  async function prompt(projectId, promptId = null) {
    const r = await req("/prompts", "POST", {
      projectId,
      promptId,
      name: "Test prompt",
      instructions: "Private synthetic instructions",
      sourceRef: "manual fixture",
    });
    assert.equal(r.statusCode, 200);
    return r.json().id;
  }
  return {
    app,
    req,
    setup,
    login,
    owner,
    connection,
    project,
    prompt,
    vaultKey,
    get secret() {
      return secret;
    },
    get now() {
      return now;
    },
    advance: (ms) => (now += ms),
  };
}
test("all customer, project, prompt, connection and audit reads/writes require a real session", async (t) => {
  const f = await fixture(t);
  for (const path of [
    "/customers",
    "/projects",
    "/prompts",
    "/connections",
    "/audit",
    "/overview",
    "/prompts/" + randomUUID(),
  ])
    assert.equal((await f.req(path)).statusCode, 401);
  for (const path of [
    "/customers",
    "/projects",
    "/prompts",
    "/connections",
    "/connections/" + randomUUID() + "/rotate",
  ])
    assert.equal((await f.req(path, "POST", {})).statusCode, 401);
});
test("first owner setup is loopback-only, rejects proxy headers and is permanently closed after enrollment", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.req("/setup")).statusCode, 404);
  assert.equal(
    (
      await f.req("/setup", "GET", undefined, {
        host: "127.0.0.1:8765",
        origin: localOrigin,
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await f.req("/setup", "GET", undefined, {
        host: "127.0.0.1:8765",
        origin: localOrigin,
        "x-forwarded-for": "127.0.0.1",
      })
    ).statusCode,
    404,
  );
  await f.owner();
  assert.equal(
    (
      await f.req("/setup", "GET", undefined, {
        host: "127.0.0.1:8765",
        origin: localOrigin,
      })
    ).statusCode,
    404,
  );
});
test("password plus fresh non-replayed MFA is required, cookies are HttpOnly/Secure/Strict, logout revokes", async (t) => {
  const f = await fixture(t);
  await f.setup();
  assert.equal(
    (
      await f.req("/auth/login", "POST", {
        email: "admin@example.test",
        password: fixturePassword,
        code: "000000",
      })
    ).statusCode,
    401,
  );
  const login = await f.login();
  const c = login.cookies.find((c) => c.name === "bo_session");
  assert.ok(c.httpOnly && c.secure);
  assert.equal(c.sameSite, "Strict");
  assert.equal(
    (
      await f.req("/auth/login", "POST", {
        email: "admin@example.test",
        password: fixturePassword,
        code: otp(f.secret).generate({ timestamp: f.now }),
      })
    ).statusCode,
    401,
  );
  assert.equal((await f.req("/auth/logout", "POST", {})).statusCode, 200);
  assert.equal((await f.req("/customers")).statusCode, 401);
});
test("mutation origin and CSRF checks reject requests even with a valid session", async (t) => {
  const f = await fixture(t);
  await f.owner();
  assert.equal(
    (await f.req("/customers", "POST", {}, { "x-csrf-token": "" })).statusCode,
    403,
  );
  assert.equal(
    (await f.req("/customers", "POST", {}, { origin: "https://evil.example" }))
      .statusCode,
    403,
  );
  assert.equal(
    (await f.req("/customers", "POST", {}, { "content-type": "text/plain" }))
      .statusCode,
    403,
  );
  assert.equal((await f.req("/customers")).statusCode, 200);
});
test("server-side inactivity expires sessions and blocks later writes", async (t) => {
  const f = await fixture(t);
  await f.owner();
  f.advance(31 * 60 * 1000);
  assert.equal((await f.req("/customers")).statusCode, 401);
  assert.equal((await f.req("/projects", "POST", {})).statusCode, 401);
});
test("failed authentication limits persist across requests without exposing account existence", async (t) => {
  const f = await fixture(t);
  await f.setup();
  let response;
  for (let i = 0; i < 5; i++) {
    response = await f.req("/auth/login", "POST", {
      email: "missing@example.test",
      password: "wrong",
      code: "000000",
    });
    assert.equal(response.statusCode, 401);
  }
  assert.equal(
    (
      await f.req("/auth/login", "POST", {
        email: "missing@example.test",
        password: "wrong",
        code: "000000",
      })
    ).statusCode,
    429,
  );
});
test("customers persist across restart; no synthetic customers are seeded in the live service", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ai-backoffice-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const dbPath = join(directory, "state.sqlite"),
    vaultKey = randomBytes(32);
  const f = await fixture(t, { dbPath, vaultKey });
  await f.owner();
  assert.equal((await f.req("/customers")).json().length, 0);
  const created = await f.req("/customers", "POST", {
    name: "Customer fixture",
    email: "fixture@example.test",
    status: "pending",
    expires: "2027-01-31",
    allowance: 300,
    assignments: [],
  });
  assert.equal(created.statusCode, 200);
  await f.app.close();
  const another = await buildServer({
    dbPath,
    vaultKey,
    origin,
    localOrigin,
    clock: () => f.now,
  });
  t.after(() => another.close());
  assert.equal(
    another.db.prepare("SELECT count(*) AS n FROM customers").get().n,
    1,
  );
  assert.ok(!(await readFile(dbPath)).includes(Buffer.from(fixturePassword)));
});
test("API keys and prompt instructions are encrypted at rest, masked in lists and excluded from audit", async (t) => {
  const f = await fixture(t);
  await f.owner();
  const id = await f.connection();
  const stored = f.app.db
    .prepare("SELECT * FROM connections WHERE id=?")
    .get(id);
  assert.ok(!JSON.stringify(stored).includes(fixtureKey));
  assert.equal(
    unseal(f.vaultKey, stored.key_secret, "connection:" + id),
    fixtureKey,
  );
  const list = await f.req("/connections");
  assert.ok(!list.body.includes(fixtureKey));
  assert.equal(list.json()[0].suffix, fixtureKey.slice(-4));
  assert.ok(!list.body.includes("key_secret"));
  const pid = await f.project();
  const vid = await f.prompt(pid);
  const pv = f.app.db
    .prepare("SELECT * FROM prompt_versions WHERE id=?")
    .get(vid);
  assert.notEqual(pv.instructions, "Private synthetic instructions");
  assert.ok(
    !(await f.req("/prompts")).body.includes("Private synthetic instructions"),
  );
  assert.equal(
    (await f.req("/prompts/" + vid)).json().instructions,
    "Private synthetic instructions",
  );
  const log = await f.req("/audit");
  assert.ok(!log.body.includes(fixtureKey));
  assert.ok(!log.body.includes("Private synthetic instructions"));
});
test("failed replacement preserves the old key, and a successful replacement increments revision", async (t) => {
  let status = "ok";
  const f = await fixture(t, { providerCheck: async () => status });
  await f.owner();
  const id = await f.connection();
  const original = f.app.db
    .prepare("SELECT key_secret FROM connections WHERE id=?")
    .get(id).key_secret;
  status = "invalid";
  const failed = await f.req("/connections/" + id + "/rotate", "POST", {
    apiKey: fixtureKey + "replacement",
    revision: 1,
  });
  assert.equal(failed.statusCode, 400);
  assert.ok(!failed.body.includes(fixtureKey));
  assert.equal(
    f.app.db.prepare("SELECT key_secret FROM connections WHERE id=?").get(id)
      .key_secret,
    original,
  );
  status = "ok";
  assert.equal(
    (
      await f.req("/connections/" + id + "/rotate", "POST", {
        apiKey: fixtureKey + "replacement",
        revision: 1,
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await f.req("/connections/" + id + "/rotate", "POST", {
        apiKey: fixtureKey + "stale",
        revision: 1,
      })
    ).statusCode,
    409,
  );
  assert.equal(
    f.app.db.prepare("SELECT revision FROM connections WHERE id=?").get(id)
      .revision,
    2,
  );
});
test("fresh MFA is required after ten minutes for API credential changes", async (t) => {
  const f = await fixture(t);
  await f.owner();
  f.advance(11 * 60 * 1000);
  assert.equal((await f.req("/connections", "POST", {})).statusCode, 403);
  assert.equal(
    (
      await f.req("/auth/reauth", "POST", {
        code: otp(f.secret).generate({ timestamp: f.now }),
      })
    ).statusCode,
    200,
  );
  await f.connection();
});
test("paused connections are not checked, and pausing does not delete project links", async (t) => {
  let calls = 0;
  const f = await fixture(t, {
    providerCheck: async () => {
      calls++;
      return "ok";
    },
  });
  await f.owner();
  const id = await f.connection();
  const pid = await f.project("Linked", id);
  assert.equal(
    (
      await f.req("/connections/" + id, "PUT", {
        label: "Paused",
        enabled: false,
        revision: 1,
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (await f.req("/connections/" + id + "/check", "POST", {})).statusCode,
    409,
  );
  assert.equal(calls, 1);
  assert.equal(
    f.app.db.prepare("SELECT connection_id FROM projects WHERE id=?").get(pid)
      .connection_id,
    id,
  );
});
test("customer/project composite references reject cross-project prompt assignments atomically", async (t) => {
  const f = await fixture(t);
  await f.owner();
  const a = await f.project("A"),
    b = await f.project("B"),
    version = await f.prompt(a);
  const v = {
    name: "Owner fixture",
    email: "owner@example.test",
    status: "active",
    expires: null,
    allowance: 300,
    assignments: [{ projectId: b, versionId: version }],
  };
  assert.equal((await f.req("/customers", "POST", v)).statusCode, 409);
  assert.equal((await f.req("/customers")).json().length, 0);
  assert.equal(
    (
      await f.req("/customers", "POST", {
        ...v,
        assignments: [{ projectId: a, versionId: version }],
      })
    ).statusCode,
    200,
  );
  const c = (await f.req("/customers")).json()[0];
  assert.equal(
    (
      await f.req("/customers/" + c.id, "PUT", {
        ...v,
        name: "Should roll back",
      })
    ).statusCode,
    409,
  );
  assert.equal((await f.req("/customers")).json()[0].name, "Owner fixture");
});
test("new immutable prompt versions preserve assignments and prevent moving configured projects", async (t) => {
  const f = await fixture(t);
  await f.owner();
  const a = await f.project("Immutable"),
    v1 = await f.prompt(a);
  const p = (await f.req("/prompts")).json()[0];
  assert.equal(
    (
      await f.req("/customers", "POST", {
        name: "Pinned fixture",
        email: "pinned@example.test",
        status: "pending",
        expires: null,
        allowance: 300,
        assignments: [{ projectId: a, versionId: v1 }],
      })
    ).statusCode,
    200,
  );
  const v2 = await f.prompt(a, p.prompt_id);
  assert.notEqual(v1, v2);
  assert.deepEqual(
    (await f.req("/prompts")).json().map((p) => p.version),
    [2, 1],
  );
  assert.equal(
    (await f.req("/customers")).json()[0].assignments[0].versionId,
    v1,
  );
  // Projects can be prepared before the owner adds their first key.
  assert.equal(
    (
      await f.req("/projects/" + a, "PUT", {
        name: "Immutable",
        description: "",
        connectionId: await f.connection(),
        enabled: true,
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await f.req("/projects/" + a, "PUT", {
        name: "Immutable",
        description: "",
        connectionId: await f.connection(),
        enabled: true,
      })
    ).statusCode,
    409,
  );
});
test("encrypted records cannot be swapped across connection identities", () => {
  const key = randomBytes(32),
    encrypted = seal(key, "synthetic secret", "connection:a");
  assert.throws(() => unseal(key, encrypted, "connection:b"));
  assert.throws(() => unseal(randomBytes(32), encrypted, "connection:a"));
});
test("logout during a slow provider check prevents the credential write", async (t) => {
  let wait = false,
    release,
    started;
  const began = new Promise((resolve) => {
    started = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const f = await fixture(t, {
    providerCheck: async () => {
      if (wait) {
        started();
        await gate;
      }
      return "ok";
    },
  });
  await f.owner();
  const id = await f.connection();
  wait = true;
  const request = f.req("/connections/" + id + "/rotate", "POST", {
    apiKey: fixtureKey + "new",
    revision: 1,
  });
  await began;
  await f.req("/auth/logout", "POST", {});
  release();
  assert.equal((await request).statusCode, 401);
  assert.equal(
    f.app.db.prepare("SELECT revision FROM connections WHERE id=?").get(id)
      .revision,
    1,
  );
});
test("password change requires both factors and revokes existing sessions", async (t) => {
  const f = await fixture(t);
  await f.owner();
  f.advance(30000);
  assert.equal(
    (
      await f.req("/auth/password", "POST", {
        currentPassword: "incorrect",
        newPassword: "A different synthetic password!",
        code: otp(f.secret).generate({ timestamp: f.now }),
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await f.req("/auth/password", "POST", {
        currentPassword: fixturePassword,
        newPassword: "A different synthetic password!",
        code: otp(f.secret).generate({ timestamp: f.now }),
      })
    ).statusCode,
    200,
  );
  assert.equal((await f.req("/customers")).statusCode, 401);
  f.advance(30000);
  assert.equal(
    (
      await f.req("/auth/login", "POST", {
        email: "admin@example.test",
        password: "A different synthetic password!",
        code: otp(f.secret).generate({ timestamp: f.now }),
      })
    ).statusCode,
    200,
  );
});
test("consistent database and vault backups restore encrypted records without the original process", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ai-backoffice-restore-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const vaultKey = randomBytes(32),
    f = await fixture(t, {
      dbPath: join(directory, "backoffice.sqlite"),
      vaultKey,
    });
  await writeFile(join(directory, "vault.key"), vaultKey, { mode: 0o600 });
  await f.owner();
  const id = await f.connection();
  const destination = join(directory, "backup");
  await promisify(execFileCallback)(
    process.execPath,
    ["server/backup.mjs", destination],
    {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, STATE_DIR: directory },
    },
  );
  const restored = await buildServer({
    dbPath: join(destination, "backoffice.sqlite"),
    vaultKey: await readFile(join(destination, "vault.key")),
    origin,
    localOrigin,
  });
  t.after(() => restored.close());
  const record = restored.db
    .prepare("SELECT key_secret FROM connections WHERE id=?")
    .get(id);
  assert.equal(
    unseal(vaultKey, record.key_secret, "connection:" + id),
    fixtureKey,
  );
  assert.equal(
    restored.db.prepare("PRAGMA integrity_check").get().integrity_check,
    "ok",
  );
});
test("provider probe uses only fixed HTTPS endpoint, refuses redirects, and suppresses raw errors", async () => {
  let request;
  const result = await checkOpenAI(
    fixtureKey,
    "proj_fixture",
    async (url, options) => {
      request = { url, options };
      return new Response("private failure payload", { status: 403 });
    },
  );
  assert.equal(result, "restricted");
  assert.equal(request.url, "https://api.openai.com/v1/models");
  assert.equal(request.options.redirect, "error");
  assert.equal(request.options.headers["OpenAI-Project"], "proj_fixture");
  assert.equal(
    await checkOpenAI(fixtureKey, "proj_fixture", async () => {
      throw new Error("must never be echoed");
    }),
    "error",
  );
});
