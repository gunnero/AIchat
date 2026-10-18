import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openPostgres } from "../server/postgres.mjs";
import { migrate } from "../server/migrate.mjs";
import { openDatabase } from "../server/database.mjs";
import { buildServer } from "../server/app.mjs";
import {
  token,
  digest,
  csrfFor,
  seal,
  unseal,
  newOtpSecret,
  hashPassword,
  otp,
} from "../server/security.mjs";
const enabled = !!process.env.TEST_DATABASE_URL;
const pgtest = (name, fn) => test(name, { skip: !enabled }, fn);
const key = randomBytes(32),
  origin = "https://customer.example.test";
let owner, app, fixtures;
const uri = (role) => {
  const u = new URL(process.env.TEST_DATABASE_URL);
  u.username = role;
  return u.href;
};
const maintenance = (fn) =>
  owner.transaction(async () => {
    await owner.query("SET LOCAL ROLE ai_owner");
    return fn();
  });
const q = (sql, args = []) => owner.query(sql, args).then((r) => r.rows);
pgtest(
  "PostgreSQL: restored cookie sessions retain the account ID across login, refresh and profile loading for both roles",
  async () => {
    for (const who of [fixtures.a, fixtures.b, fixtures.admin, fixtures.main]) {
      const restored = await req(who, "/api/auth/session");
      assert.equal(restored.statusCode, 200);
      assert.equal(restored.json().id, who.id);
      const record = (
        await q("SELECT email FROM admins WHERE id=$1", [who.id])
      )[0];
      const login = await req(who, "/api/auth/login", "POST", {
        email: record.email,
        password: who.password,
        code: otp(who.secret).generate(),
      });
      assert.equal(login.statusCode, 200, login.body);
      const cookie = login.cookies.find((c) => c.name === "__Host-ai_session");
      const signedIn = {
        headers: {
          ...who.headers,
          cookie: cookie.name + "=" + cookie.value,
          "x-csrf-token": login.json().csrf,
        },
      };
      for (const path of [
        "/api/auth/session",
        "/backoffice/api/auth/session",
      ]) {
        const refreshed = await req(signedIn, path);
        assert.equal(refreshed.statusCode, 200);
        assert.deepEqual(refreshed.json(), login.json());
        assert.equal(refreshed.json().id, who.id);
      }
      const account = await req(signedIn, "/api/account");
      assert.equal(account.statusCode, 200);
      assert.equal(account.json().id, login.json().id);
      assert.equal(
        (
          await req(signedIn, "/api/account/profile", "PUT", {
            name: "Restored profile",
          })
        ).statusCode,
        200,
      );
      assert.equal(
        (await req(signedIn, "/api/auth/session")).json().name,
        "Restored profile",
      );
    }
  },
);
pgtest(
  "PostgreSQL: personal profiles are session-owned, persistent and separate from protected identity",
  async () => {
    const { a, b, admin, main } = fixtures;
    assert.equal((await req(null, "/api/account")).statusCode, 401);
    for (const who of [a, admin, main]) {
      const before = (await q("SELECT * FROM admins WHERE id=$1", [who.id]))[0];
      const profile = await req(who, "/api/account/profile", "PUT", {
        name: "<b>Personal display</b>",
      });
      assert.equal(profile.statusCode, 200, profile.body);
      assert.equal(
        (await req(who, "/api/auth/session")).json().name,
        "<b>Personal display</b>",
      );
      assert.equal(
        (await req(who, "/api/account?accountId=" + b.id)).json().id,
        who.id,
      );
      assert.deepEqual(
        (await q("SELECT * FROM admins WHERE id=$1", [who.id]))[0],
        before,
      );
      assert.equal(
        (
          await req(who, "/api/account/profile", "PUT", {
            name: "Other",
            accountId: b.id,
          })
        ).statusCode,
        400,
      );
      const badCsrf = { headers: { ...who.headers, "x-csrf-token": "wrong" } };
      assert.equal(
        (await req(badCsrf, "/api/account/profile", "PUT", { name: "Other" }))
          .statusCode,
        403,
      );
      const badOrigin = {
        headers: { ...who.headers, origin: "https://elsewhere.example.test" },
      };
      assert.equal(
        (await req(badOrigin, "/api/account/profile", "PUT", { name: "Other" }))
          .statusCode,
        403,
      );
      const signed = await req(null, "/api/auth/login", "POST", {
        email: before.email,
        password: who.password,
        code: otp(who.secret).generate(),
      });
      // Login requires the configured Origin, even before a session exists.
      assert.equal(signed.statusCode, 403);
      const login = await req(who, "/api/auth/login", "POST", {
        email: before.email,
        password: who.password,
        code: otp(who.secret).generate(),
      });
      assert.equal(login.statusCode, 200, login.body);
      assert.equal(login.json().name, "<b>Personal display</b>");
    }
    assert.ok(
      !(await req(b, "/api/account")).body.includes("Personal display"),
    );
    await assert.rejects(
      app.db.query("UPDATE admins SET name='forbidden' WHERE id=$1", [main.id]),
      { code: "23514" },
    );
    assert.ok(
      !(await q("SELECT * FROM audit")).some((row) =>
        JSON.stringify(row).includes("Personal display"),
      ),
    );
  },
);

pgtest(
  "PostgreSQL: assigned Admins have their own persistent chats, never another user's chats",
  async () => {
    const { a, p, other, admin, main } = fixtures;
    assert.deepEqual(
      (await req(admin, "/api/customer/projects")).json().projects,
      [],
    );
    const assign = (who) =>
      req(who, `/backoffice/api/staff/${who.id}/workspace`, "PUT", {
        allowance: 250,
        assignments: [{ projectId: p.id, versionId: p.v }],
      });
    assert.equal((await assign(admin)).statusCode, 200);
    assert.equal((await assign(main)).statusCode, 200);
    const customerChat = await create(a, p),
      staffChat = await create(admin, p),
      ownerChat = await create(main, p);
    for (const [who, c] of [
      [a, customerChat],
      [admin, staffChat],
      [main, ownerChat],
    ]) {
      await save(who, p, c);
      assert.equal((await req(who, url(p, c.id))).statusCode, 200);
      assert.equal(
        (await req(who, "/api/account")).json().allowance,
        who === a ? 100 : 250,
      );
      for (const otherUser of [a, admin, main].filter((v) => v !== who)) {
        assert.equal((await req(otherUser, url(p, c.id))).statusCode, 404);
        assert.equal(
          (await req(otherUser, url(p, c.id) + "/messages")).statusCode,
          404,
        );
        assert.equal(
          (await req(otherUser, url(p, c.id), "DELETE", {})).statusCode,
          404,
        );
      }
    }
    assert.equal(
      (
        await req(a, `/backoffice/api/staff/${admin.id}/workspace`, "PUT", {
          allowance: 1,
          assignments: [],
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await req(admin, `/backoffice/api/staff/${main.id}/workspace`, "PUT", {
          allowance: 1,
          assignments: [],
        })
      ).statusCode,
      403,
    );
    const workspace = (
      await q("SELECT customer_id FROM admin_workspaces WHERE account_id=$1", [
        admin.id,
      ])
    )[0];
    const staffList = (await req(admin, "/backoffice/api/staff")).json();
    assert.equal(
      staffList.find((v) => v.id === admin.id).assignments.length,
      1,
    );
    assert.ok(
      staffList.every((v) => v.role === "Admin" && !("protected" in v)),
    );
    assert.ok(
      !(await req(admin, "/backoffice/api/customers")).body.includes(
        workspace.customer_id,
      ),
    );
    const forged = await req(
      admin,
      `/backoffice/api/staff/${admin.id}/workspace`,
      "PUT",
      { allowance: 99, assignments: [{ projectId: p.id, versionId: other.v }] },
    );
    assert.equal(forged.statusCode, 409);
    assert.equal((await req(admin, "/api/account")).json().allowance, 250);
    assert.equal((await req(admin, url(p, staffChat.id))).statusCode, 200);
    assert.equal(
      (
        await req(admin, `/backoffice/api/staff/${admin.id}/workspace`, "PUT", {
          allowance: 250,
          assignments: [],
        })
      ).statusCode,
      200,
    );
    assert.equal((await req(admin, url(p, staffChat.id))).statusCode, 404);
    assert.equal((await req(main, url(p, ownerChat.id))).statusCode, 200);
    await maintenance(() =>
      q("UPDATE sessions SET mfa_at=$1 WHERE hash=$2", [
        Date.now() - 11 * 60000,
        digest(admin.raw),
      ]),
    );
    const stale = await assign(admin);
    assert.equal(stale.statusCode, 403);
    assert.equal(stale.json().code, "reauth_required");
  },
);
async function account(role = "customer", customer = null, protectedOwner = 0) {
  const id = randomUUID(),
    raw = token(),
    now = Date.now(),
    secret = newOtpSecret(),
    password = "Synthetic fixture password 2026!";
  await q(
    "INSERT INTO admins(id,email,name,username,role,protected,status,password_hash,mfa_secret,created_at,customer_id) VALUES($1,$2,$3,$4,$5,$6,'active',$7,$8,$9,$10)",
    [
      id,
      id + "@example.test",
      "Synthetic " + role,
      "u" + id,
      role,
      protectedOwner,
      await hashPassword(password),
      seal(key, secret, "mfa:" + id),
      new Date().toISOString(),
      customer,
    ],
  );
  await q("INSERT INTO sessions VALUES($1,$2,$3,$3,$4,$3)", [
    digest(raw),
    id,
    now,
    now + 43200000,
  ]);
  return {
    id,
    raw,
    secret,
    password,
    headers: {
      cookie: "__Host-ai_session=" + raw,
      origin,
      "content-type": "application/json",
      "x-csrf-token": csrfFor(key, raw),
    },
  };
}
async function customer() {
  const id = randomUUID(),
    now = new Date().toISOString();
  await q("INSERT INTO customers VALUES($1,$2,$3,'active',null,100,$4,$4)", [
    id,
    "Synthetic customer",
    id + "@example.test",
    now,
  ]);
  return { customerId: id, ...(await account("customer", id)) };
}
async function project() {
  const id = randomUUID(),
    v = randomUUID(),
    now = new Date().toISOString();
  await q(
    "INSERT INTO projects VALUES($1,$2,'Synthetic project',null,1,$3,$3)",
    [id, "Project " + id, now],
  );
  await q(
    "INSERT INTO prompt_versions VALUES($1,$2,$3,'Synthetic prompt',1,$4,'','checksum',$5)",
    [
      v,
      id,
      randomUUID(),
      seal(key, "Synthetic instructions", "prompt:" + v),
      now,
    ],
  );
  return { id, v };
}
const url = (p, c = "") =>
  "/api/customer/projects/" + p.id + "/conversations" + (c ? "/" + c : "");
async function req(who, path, method = "GET", body) {
  return app.inject({
    url: path,
    method,
    headers: who?.headers || {},
    ...(body !== undefined ? { payload: body } : {}),
  });
}
async function create(who, p, requestId = randomUUID()) {
  const r = await req(who, url(p), "POST", { requestId });
  assert.equal(r.statusCode, 200, r.body);
  return r.json();
}
async function save(
  who,
  p,
  c,
  text = "Private synthetic message",
  requestId = randomUUID(),
) {
  const r = await req(who, url(p, c.id) + "/messages", "POST", {
    text,
    requestId,
  });
  assert.equal(r.statusCode, 200, r.body);
  return r.json();
}
before(async () => {
  if (!enabled) return;
  owner = openPostgres(uri("ai_migrator"));
  await maintenance(async () => {
    await q("DROP SCHEMA IF EXISTS private CASCADE");
    await q("DROP SCHEMA public CASCADE");
    await q("CREATE SCHEMA public AUTHORIZATION ai_owner");
  });
  await migrate(owner);
});
beforeEach(async () => {
  if (!enabled) return;
  await app?.close();
  await maintenance(() =>
    q(
      "TRUNCATE usage_reporting,customers,admins,connections,projects,prompt_versions,assignments,audit,owner_identity,invitations,login_failures,sessions,setup_sessions,registrations,private.conversations,private.messages,private.deletions CASCADE",
    ),
  );
  fixtures = await maintenance(async () => {
    const a = await customer(),
      b = await customer(),
      p = await project(),
      other = await project(),
      admin = await account("admin"),
      main = await account("admin", null, 1);
    await q("INSERT INTO assignments VALUES($1,$2,$3),($4,$2,$3),($1,$5,$6)", [
      a.customerId,
      p.id,
      p.v,
      b.customerId,
      other.id,
      other.v,
    ]);
    return { a, b, p, other, admin, main };
  });
  app = await buildServer({
    database: openPostgres(uri("ai_control")),
    customerDatabase: openPostgres(uri("ai_chat")),
    vaultKey: key,
    origin,
    providerCheck: async () => {
      throw new Error("No provider calls in history tests");
    },
    mailer: async () => {
      throw new Error("No fixture email");
    },
  });
});
after(async () => {
  if (enabled) {
    await app?.close();
    await owner?.close();
  }
});
pgtest(
  "PostgreSQL: usage metadata is Admin-only, counts shared allowances once and has no access to chat contents or reporting secrets",
  async () => {
    const { a, b, p, other, admin, main } = fixtures;
    const c = await create(a, p);
    await save(a, p, c, "Private usage-test content never shown to Admins");
    for (const who of [a, b]) {
      assert.equal((await req(who, "/backoffice/api/usage")).statusCode, 403);
      assert.equal(
        (await req(who, "/backoffice/api/usage/openai?month=2026-10"))
          .statusCode,
        403,
      );
      assert.equal(
        (
          await req(who, "/backoffice/api/usage/connection", "POST", {
            label: "Attempt",
            apiKey: "sk-admin-synthetic-unauthorized-test",
            revision: 0,
          })
        ).statusCode,
        403,
      );
    }
    assert.equal((await req(null, "/backoffice/api/usage")).statusCode, 401);
    assert.equal(
      (
        await req(main, `/backoffice/api/staff/${admin.id}/workspace`, "PUT", {
          allowance: 500,
          assignments: [
            { projectId: p.id, versionId: p.v },
            { projectId: other.id, versionId: other.v },
          ],
        })
      ).statusCode,
      200,
    );
    for (const who of [admin, main]) {
      const result = await req(who, "/backoffice/api/usage");
      assert.equal(result.statusCode, 200);
      assert.equal(result.json().totalAllowance, 700);
      assert.equal(result.json().accounts.length, 4);
      assert.equal(
        result.json().accounts.find((row) => row.accountId === admin.id)
          .allowance,
        500,
      );
      assert.ok(
        !/Private usage-test|key_secret|mfa_secret|password_hash|protected|title_secret|body_secret/.test(
          result.body,
        ),
      );
      assert.equal(result.json().appTrackingEnabled, false);
      assert.equal(result.json().connection, null);
    }
    const chat = openPostgres(uri("ai_chat"));
    try {
      await assert.rejects(
        chat.query("SELECT * FROM usage_reporting"),
        (e) => e.code === "42501",
      );
      await assert.rejects(
        chat.query("DELETE FROM usage_reporting"),
        (e) => e.code === "42501",
      );
    } finally {
      await chat.close();
    }
  },
);

pgtest(
  "PostgreSQL: schema-7 backup restores and upgrades to 8 without changing enrolled identities, project colours or encrypted history",
  async () => {
    const { a, p } = fixtures,
      c = await create(a, p);
    await save(a, p, c, "Usage migration persistence fixture");
    await maintenance(() =>
      q("INSERT INTO project_appearance VALUES($1,'green')", [p.id]),
    );
    const identities = await q("SELECT * FROM admins ORDER BY id"),
      sessions = await q("SELECT * FROM sessions ORDER BY hash"),
      messages = await maintenance(() =>
        q("SELECT * FROM private.messages ORDER BY id"),
      );
    await maintenance(() =>
      q(
        "ALTER TABLE project_appearance DROP CONSTRAINT project_appearance_color_check; ALTER TABLE project_appearance ADD CONSTRAINT project_appearance_color_check CHECK(color IN ('black','yellow','purple','green')); DELETE FROM schema_version WHERE version=8",
      ),
    );
    const { backupPostgres, restorePostgres } =
      await import("../server/postgres-backup.mjs");
    const { writeFile } = await import("node:fs/promises");
    const dir = await mkdtemp(join(tmpdir(), "ai-usage-upgrade-")),
      restore = openPostgres(process.env.TEST_RESTORE_DATABASE_URL);
    try {
      await writeFile(join(dir, "vault.key"), key, { mode: 0o600 });
      const journal = join(dir, "deletions.jsonl");
      await writeFile(journal, "", { mode: 0o600 });
      assert.equal(
        (
          await backupPostgres({
            databaseUrl: uri("ai_migrator"),
            state: dir,
            destination: join(dir, "backup"),
          })
        ).schema,
        7,
      );
      await restore.transaction(async () => {
        await restore.query("SET LOCAL ROLE ai_owner");
        await restore.query(
          "DROP SCHEMA IF EXISTS private CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION ai_owner",
        );
      });
      assert.equal(
        (
          await restorePostgres({
            databaseUrl: process.env.TEST_RESTORE_DATABASE_URL,
            backup: join(dir, "backup"),
            journal,
          })
        ).schema,
        7,
      );
      assert.deepEqual(await migrate(restore), { schema: 8, imported: false });
      assert.deepEqual(
        (await restore.query("SELECT * FROM admins ORDER BY id")).rows,
        identities,
      );
      assert.equal(
        (
          await restore.query(
            "SELECT color FROM project_appearance WHERE project_id=$1",
            [p.id],
          )
        ).rows[0].color,
        "green",
      );
      await restore.transaction(async () => {
        await restore.query("SET LOCAL ROLE ai_owner");
        assert.deepEqual(
          (await restore.query("SELECT * FROM private.messages ORDER BY id"))
            .rows,
          messages,
        );
      });
      assert.deepEqual(await migrate(owner), { schema: 8, imported: false });
      assert.deepEqual(await migrate(owner), { schema: 8, imported: false });
      assert.deepEqual(await q("SELECT * FROM admins ORDER BY id"), identities);
      assert.deepEqual(
        await q("SELECT * FROM sessions ORDER BY hash"),
        sessions,
      );
      assert.equal((await req(a, url(p, c.id))).statusCode, 200);
    } finally {
      await restore.close();
      await rm(dir, { recursive: true, force: true });
    }
  },
);

pgtest(
  "PostgreSQL: project colours persist, validate and remain scoped to assigned workspaces",
  async () => {
    const { a, b, p, other, admin, main } = fixtures;
    const endpoint = `/backoffice/api/projects/${p.id}`;
    const record = (await req(admin, "/backoffice/api/projects"))
      .json()
      .find((project) => project.id === p.id);
    const body = {
      name: record.name,
      description: record.description,
      connectionId: null,
      enabled: true,
    };
    assert.equal(record.color, "black");
    for (const who of [a, b])
      assert.equal(
        (await req(who, endpoint, "PUT", { ...body, color: "yellow" }))
          .statusCode,
        403,
      );
    assert.equal(
      (
        await req(
          { headers: { origin, "content-type": "application/json" } },
          endpoint,
          "PUT",
          { ...body, color: "yellow" },
        )
      ).statusCode,
      401,
    );
    for (const color of [
      "yellow",
      "purple",
      "green",
      "black",
      "#ffffff",
      "#000000",
      "#F08A24",
    ]) {
      assert.equal(
        (await req(admin, endpoint, "PUT", { ...body, color })).statusCode,
        200,
      );
      for (const who of [a, b])
        assert.equal(
          (await req(who, "/api/customer/projects"))
            .json()
            .projects.find((project) => project.id === p.id).color,
          color.toLowerCase(),
        );
    }
    assert.equal(
      (await req(main, endpoint, "PUT", { ...body, color: "green" }))
        .statusCode,
      200,
    );
    assert.equal((await req(admin, endpoint, "PUT", body)).statusCode, 200);
    for (const color of [
      "red",
      "#fff",
      "#abcdef\n",
      "#12345g",
      "#12345678",
      "#123456; color:red",
      "url(https://untrusted.test)",
      null,
    ])
      assert.equal(
        (await req(admin, endpoint, "PUT", { ...body, color })).statusCode,
        400,
      );
    await assert.rejects(
      () =>
        maintenance(() =>
          q("UPDATE project_appearance SET color=$1 WHERE project_id=$2", [
            "#123456; color:red",
            p.id,
          ]),
        ),
      { code: "23514" },
    );
    assert.equal(
      (
        await q("SELECT color FROM project_appearance WHERE project_id=$1", [
          p.id,
        ])
      )[0].color,
      "green",
    );
    assert.equal(
      (await req(admin, "/backoffice/api/projects"))
        .json()
        .find((project) => project.id === p.id).color,
      "green",
    );
    await maintenance(() =>
      q("INSERT INTO project_appearance VALUES($1,'purple')", [other.id]),
    );
    assert.equal(
      (await req(a, "/api/customer/projects"))
        .json()
        .projects.find((project) => project.id === other.id).color,
      "purple",
    );
    assert.equal(
      (await req(b, "/api/customer/projects"))
        .json()
        .projects.some((project) => project.id === other.id),
      false,
    );
    const chat = openPostgres(uri("ai_chat"));
    try {
      assert.deepEqual(
        (await chat.query("SELECT * FROM public.chat_workspace_projects()"))
          .rows,
        [],
      );
      await assert.rejects(
        chat.query("SELECT * FROM project_appearance"),
        (e) => e.code === "42501",
      );
      await assert.rejects(
        chat.query("INSERT INTO project_appearance VALUES($1,'yellow')", [
          other.id,
        ]),
        (e) => e.code === "42501",
      );
    } finally {
      await chat.close();
    }
    await maintenance(() =>
      q("DELETE FROM assignments WHERE customer_id=$1 AND project_id=$2", [
        a.customerId,
        p.id,
      ]),
    );
    assert.equal(
      (await req(a, "/api/customer/projects"))
        .json()
        .projects.some((project) => project.id === p.id),
      false,
    );
  },
);

pgtest(
  "PostgreSQL: schema 5 upgrade and backup restoration preserve identity, MFA and private history",
  async () => {
    const { a, p, main } = fixtures;
    const c = await create(a, p);
    await save(a, p, c, "Appearance migration fixture");
    const identities = await q("SELECT * FROM admins ORDER BY id"),
      sessions = await q("SELECT * FROM sessions ORDER BY hash");
    const encrypted = await maintenance(() =>
      q("SELECT * FROM private.messages ORDER BY id"),
    );
    await maintenance(() =>
      q(
        "DROP FUNCTION public.chat_workspace_projects(); DROP TABLE project_appearance; DROP TABLE usage_reporting; DELETE FROM schema_version WHERE version>=6",
      ),
    );
    const { backupPostgres, restorePostgres } =
      await import("../server/postgres-backup.mjs");
    const { writeFile } = await import("node:fs/promises");
    const dir = await mkdtemp(join(tmpdir(), "ai-appearance-upgrade-"));
    const restore = openPostgres(process.env.TEST_RESTORE_DATABASE_URL);
    try {
      await writeFile(join(dir, "vault.key"), key, { mode: 0o600 });
      const journal = join(dir, "deletions.jsonl");
      await writeFile(journal, "", { mode: 0o600 });
      assert.equal(
        (
          await backupPostgres({
            databaseUrl: uri("ai_migrator"),
            state: dir,
            destination: join(dir, "backup"),
          })
        ).schema,
        5,
      );
      await restore.transaction(async () => {
        await restore.query("SET LOCAL ROLE ai_owner");
        await restore.query(
          "DROP SCHEMA IF EXISTS private CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION ai_owner",
        );
      });
      assert.equal(
        (
          await restorePostgres({
            databaseUrl: process.env.TEST_RESTORE_DATABASE_URL,
            backup: join(dir, "backup"),
            journal,
          })
        ).schema,
        5,
      );
      assert.deepEqual(await migrate(restore), { schema: 8, imported: false });
      assert.deepEqual(
        (await restore.query("SELECT * FROM admins ORDER BY id")).rows,
        identities,
      );
      await restore.transaction(async () => {
        await restore.query("SET LOCAL ROLE ai_owner");
        assert.deepEqual(
          (await restore.query("SELECT * FROM private.messages ORDER BY id"))
            .rows,
          encrypted,
        );
      });
      assert.deepEqual(await migrate(owner), { schema: 8, imported: false });
      assert.deepEqual(await migrate(owner), { schema: 8, imported: false });
      assert.deepEqual(await q("SELECT * FROM admins ORDER BY id"), identities);
      assert.deepEqual(
        await q("SELECT * FROM sessions ORDER BY hash"),
        sessions,
      );
      assert.equal(
        (await req(a, "/api/customer/projects"))
          .json()
          .projects.find((project) => project.id === p.id).color,
        "black",
      );
      assert.equal((await req(a, url(p, c.id))).statusCode, 200);
      await assert.rejects(
        app.db.query("UPDATE admins SET protected=0 WHERE id=$1", [main.id]),
        (e) => e.code === "23514",
      );
    } finally {
      await restore.close();
      await rm(dir, { recursive: true, force: true });
    }
  },
);

pgtest(
  "PostgreSQL: every operation is private across customers, projects and both Admin identities",
  async () => {
    const { a, b, p, other, admin, main } = fixtures,
      c = await create(a, p);
    await save(a, p, c);
    assert.equal((await req(null, url(p))).statusCode, 401);
    for (const who of [admin, main])
      assert.equal((await req(who, url(p, c.id))).statusCode, 404);
    assert.deepEqual((await req(b, url(p))).json().items, []);
    for (const route of [
      url(p, c.id),
      url(p, c.id) + "/messages",
      url(other, c.id),
    ])
      assert.equal((await req(b, route)).statusCode, 404);
    assert.equal(
      (await req(b, url(p, c.id), "PATCH", { title: "attack" })).statusCode,
      404,
    );
    assert.equal((await req(b, url(p, c.id), "DELETE", {})).statusCode, 404);
    assert.equal(
      (
        await req(b, url(p, c.id) + "/messages", "POST", {
          text: "attack",
          requestId: randomUUID(),
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await req(a, url(p), "POST", {
          requestId: randomUUID(),
          customerId: b.customerId,
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await req(a, url(p, c.id) + "/messages", "POST", {
          text: "attack",
          requestId: randomUUID(),
          role: "assistant",
        })
      ).statusCode,
      400,
    );
    assert.equal((await req(a, url(other, c.id))).statusCode, 404);
    assert.equal((await req(a, "/backoffice/api/customers")).statusCode, 403);
  },
);
pgtest(
  "PostgreSQL: row policies deny unscoped SQL, forged customers, Admin sessions, and pooled context leakage",
  async () => {
    const { a, b, p, admin, main } = fixtures,
      c = await create(a, p);
    await save(a, p, c);
    const chat = openPostgres(uri("ai_chat"), { max: 1 });
    try {
      assert.deepEqual(
        (await chat.query("SELECT * FROM private.messages")).rows,
        [],
      );
      for (const who of [b, admin, main])
        await chat.transaction(
          async () =>
            assert.deepEqual(
              (await chat.query("SELECT * FROM private.messages")).rows,
              [],
            ),
          { sessionHash: digest(who.raw), shared: true },
        );
      await chat.transaction(
        async () =>
          assert.equal(
            (await chat.query("SELECT * FROM private.messages")).rows.length,
            1,
          ),
        { sessionHash: digest(a.raw), shared: true },
      );
      assert.deepEqual(
        (await chat.query("SELECT * FROM private.messages")).rows,
        [],
      );
      await assert.rejects(chat.query("SELECT * FROM admins"), {
        code: "42501",
      });
      await assert.rejects(app.db.query("SELECT * FROM private.messages"), {
        code: "42501",
      });
      await chat
        .transaction(
          async () => {
            await assert.rejects(
              chat.query(
                "INSERT INTO private.conversations(id,customer_id,project_id,version_id,title_secret,created_at,updated_at,create_request_id) VALUES($1,$2,$3,$4,'forged',1,1,$5)",
                [randomUUID(), b.customerId, p.id, p.v, randomUUID()],
              ),
              { code: "42501" },
            );
            throw new Error("rollback");
          },
          { sessionHash: digest(a.raw), shared: true },
        )
        .catch((e) => assert.equal(e.message, "rollback"));
    } finally {
      await chat.close();
    }
  },
);
pgtest(
  "PostgreSQL: concurrent retries are ordered, deduplicated and survive process restart",
  async () => {
    const { a, p } = fixtures,
      id = randomUUID();
    const [one, two] = await Promise.all([create(a, p, id), create(a, p, id)]);
    assert.equal(one.id, two.id);
    const rid = randomUUID();
    const [m, n] = await Promise.all([
      save(a, p, one, "first", rid),
      save(a, p, one, "first", rid),
    ]);
    assert.equal(m.id, n.id);
    const more = await Promise.all(
      Array.from({ length: 5 }, (_, i) => save(a, p, one, "next " + i)),
    );
    assert.deepEqual(more.map((v) => v.sequence).sort(), [2, 3, 4, 5, 6]);
    assert.equal(
      (
        await req(a, url(p, one.id) + "/messages", "POST", {
          text: "different",
          requestId: rid,
        })
      ).statusCode,
      409,
    );
    await app.close();
    app = await buildServer({
      database: openPostgres(uri("ai_control")),
      customerDatabase: openPostgres(uri("ai_chat")),
      vaultKey: key,
      origin,
    });
    const history = await req(a, url(p, one.id) + "/messages");
    assert.equal(history.statusCode, 200);
    assert.equal(history.json().items.length, 6);
    assert.equal(history.headers["cache-control"], "no-store");
  },
);
pgtest(
  "PostgreSQL: title-only search, owner-bound cursors, rename, pagination, encryption and cascading deletion",
  async () => {
    const { a, b, p } = fixtures,
      c = await create(a, p);
    await save(a, p, c, "Body-only phrase");
    assert.equal(
      (await req(a, url(p, c.id), "PATCH", { title: "My private title" }))
        .statusCode,
      200,
    );
    const second = await create(a, p);
    await save(a, p, second, "Another title");
    assert.equal((await req(a, url(p) + "?q=PRIVATE")).json().items.length, 1);
    assert.equal(
      (await req(a, url(p) + "?q=Body-only")).json().items.length,
      0,
    );
    const page = (await req(a, url(p) + "?limit=1")).json();
    assert.equal(page.items.length, 1);
    assert.ok(page.nextCursor);
    assert.equal(
      (
        await req(
          a,
          url(p) + "?limit=1&cursor=" + encodeURIComponent(page.nextCursor),
        )
      ).json().items.length,
      1,
    );
    assert.equal(
      (await req(b, url(p) + "?cursor=" + encodeURIComponent(page.nextCursor)))
        .statusCode,
      400,
    );
    await maintenance(async () => {
      const [raw] = await q(
        "SELECT title_secret FROM private.conversations WHERE id=$1",
        [c.id],
      );
      assert.ok(!raw.title_secret.includes("My private"));
      const [body] = await q(
        "SELECT body_secret FROM private.messages WHERE conversation_id=$1",
        [c.id],
      );
      assert.ok(!body.body_secret.includes("Body-only"));
    });
    assert.equal((await req(a, url(p, c.id), "DELETE", {})).statusCode, 200);
    assert.equal((await req(a, url(p, c.id))).statusCode, 404);
    await maintenance(async () => {
      assert.equal(
        (
          await q("SELECT * FROM private.messages WHERE conversation_id=$1", [
            c.id,
          ])
        ).length,
        0,
      );
      assert.equal(
        (
          await q("SELECT * FROM private.deletions WHERE conversation_id=$1", [
            c.id,
          ])
        ).length,
        1,
      );
    });
  },
);
pgtest(
  "PostgreSQL: reassignment is read-only, revocation hides retained history, and disabled/expired accounts stop immediately",
  async () => {
    const { a, p } = fixtures,
      c = await create(a, p);
    await save(a, p, c);
    const v = randomUUID();
    await maintenance(async () => {
      const [prior] = await q("SELECT * FROM prompt_versions WHERE id=$1", [
        p.v,
      ]);
      await q("INSERT INTO prompt_versions VALUES($1,$2,$3,$4,2,$5,$6,$7,$8)", [
        v,
        p.id,
        prior.prompt_id,
        prior.name,
        seal(key, "new", "prompt:" + v),
        "",
        "checksum",
        new Date().toISOString(),
      ]);
      await q(
        "UPDATE assignments SET version_id=$1 WHERE customer_id=$2 AND project_id=$3",
        [v, a.customerId, p.id],
      );
    });
    assert.equal((await req(a, url(p, c.id))).json().writable, false);
    assert.equal(
      (
        await req(a, url(p, c.id) + "/messages", "POST", {
          text: "stale",
          requestId: randomUUID(),
        })
      ).statusCode,
      409,
    );
    const fresh = await create(a, p);
    await save(a, p, fresh, "new version");
    await maintenance(() =>
      q("DELETE FROM assignments WHERE customer_id=$1 AND project_id=$2", [
        a.customerId,
        p.id,
      ]),
    );
    assert.equal((await req(a, url(p, c.id))).statusCode, 404);
    assert.equal((await req(a, url(p))).statusCode, 404);
    await maintenance(() =>
      q("INSERT INTO assignments VALUES($1,$2,$3)", [a.customerId, p.id, v]),
    );
    assert.equal((await req(a, url(p, c.id))).statusCode, 200);
    await maintenance(() =>
      q("UPDATE customers SET expires='2000-01-01' WHERE id=$1", [
        a.customerId,
      ]),
    );
    assert.equal((await req(a, url(p, c.id))).statusCode, 401);
  },
);
pgtest(
  "PostgreSQL: canonical authentication preserves password/MFA protection, CSRF and protected-owner triggers",
  async () => {
    const { a, p, main } = fixtures;
    const signed = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin, "content-type": "application/json" },
      payload: {
        email: "u" + a.id,
        password: a.password,
        code: otp(a.secret).generate(),
      },
    });
    assert.equal(signed.statusCode, 200, signed.body);
    const cookie = signed.cookies.find(
      (c) => c.name === "__Host-ai_session" && c.value,
    );
    assert.equal(cookie.path, "/");
    assert.ok(cookie.httpOnly && cookie.secure);
    assert.equal(signed.json().role, "Customer");
    assert.equal(
      (
        await req(
          { ...a, headers: { ...a.headers, "x-csrf-token": "invalid" } },
          url(p),
          "POST",
          { requestId: randomUUID() },
        )
      ).statusCode,
      403,
    );
    await assert.rejects(
      app.db.query("UPDATE admins SET status='paused' WHERE id=$1", [main.id]),
      { code: "23514" },
    );
    await assert.rejects(
      app.db.query("DELETE FROM admins WHERE id=$1", [main.id]),
      { code: "23514" },
    );
  },
);
pgtest(
  "PostgreSQL: SQLite import verifies preserved identities, encrypted secrets and invitations while invalidating sessions",
  async () => {
    await app.close();
    app = null;
    const dir = await mkdtemp(join(tmpdir(), "ai-migrate-")),
      file = join(dir, "source.sqlite"),
      sqlite = openDatabase(file),
      id = randomUUID(),
      sid = token(),
      secret = newOtpSecret();
    const hash = await hashPassword("Synthetic migration password");
    sqlite
      .prepare(
        "INSERT INTO admins(id,email,name,password_hash,mfa_secret,created_at,username,protected) VALUES(?,?,?,?,?,?,?,1)",
      )
      .run(
        id,
        "migration@example.test",
        "Migration",
        hash,
        seal(key, secret, "mfa:" + id),
        new Date().toISOString(),
        "migration",
      );
    sqlite
      .prepare("INSERT INTO sessions VALUES(?,?,?,?,?,?)")
      .run(
        digest(sid),
        id,
        Date.now(),
        Date.now(),
        Date.now() + 43200000,
        Date.now(),
      );
    const iid = randomUUID();
    sqlite
      .prepare("INSERT INTO invitations VALUES(?,?,?,?,?,?)")
      .run(
        iid,
        id,
        digest(token()),
        Date.now() + 60000,
        "sent",
        new Date().toISOString(),
      );
    sqlite.close();
    try {
      await maintenance(async () => {
        await q("DROP SCHEMA private CASCADE");
        await q("DROP SCHEMA public CASCADE");
        await q("CREATE SCHEMA public AUTHORIZATION ai_owner");
      });
      const result = await migrate(owner, file);
      assert.equal(result.imported, true);
      await maintenance(async () => {
        const [row] = await q("SELECT * FROM admins WHERE id=$1", [id]);
        assert.equal(row.password_hash, hash);
        assert.equal(unseal(key, row.mfa_secret, "mfa:" + id), secret);
        assert.equal(row.protected, 1);
        assert.equal(
          (await q("SELECT * FROM invitations WHERE id=$1", [iid])).length,
          1,
        );
        assert.equal((await q("SELECT * FROM sessions")).length, 0);
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
pgtest(
  "PostgreSQL: revocation waits for active policy transactions and defeats a queued request before data can be returned",
  async () => {
    const { a, p } = fixtures,
      c = await create(a, p);
    await save(a, p, c);
    const chat = openPostgres(uri("ai_chat"));
    let release, locked;
    const ready = new Promise((r) => (locked = r)),
      gate = new Promise((r) => (release = r));
    const reading = chat.transaction(
      async () => {
        await chat.query("SELECT * FROM private.messages");
        locked();
        await gate;
      },
      { sessionHash: digest(a.raw), shared: true },
    );
    await ready;
    let revoked = false;
    const revoking = maintenance(async () => {
      await q(
        "DELETE FROM assignments WHERE customer_id=$1 AND project_id=$2",
        [a.customerId, p.id],
      );
      revoked = true;
    });
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(revoked, false);
    release();
    await reading;
    await revoking;
    assert.equal((await req(a, url(p, c.id) + "/messages")).statusCode, 404);
    await chat.close();
  },
);
pgtest(
  "PostgreSQL: invitations, registration and metadata editing operate through the migrated backoffice adapter",
  async () => {
    const { admin, p } = fixtures;
    let delivered;
    await app.close();
    app = await buildServer({
      database: openPostgres(uri("ai_control")),
      customerDatabase: openPostgres(uri("ai_chat")),
      vaultKey: key,
      origin,
      mailer: async (m) => {
        delivered = m;
        return true;
      },
    });
    const c = await req(admin, "/backoffice/api/customers", "POST", {
      name: "Invited fixture",
      email: "invited@example.test",
      locale: "en",
      status: "pending",
      expires: null,
      allowance: 20,
      assignments: [{ projectId: p.id, versionId: p.v }],
    });
    assert.equal(c.statusCode, 200, c.body);
    assert.ok(delivered.text.includes("#invite="));
    const raw = delivered.text.match(/#invite=([A-Za-z0-9_-]+)/)[1];
    const begun = await app.inject({
      method: "POST",
      url: "/backoffice/api/register/begin",
      headers: { origin, "content-type": "application/json" },
      payload: { token: raw },
    });
    assert.equal(begun.statusCode, 200, begun.body);
    const reg = begun.cookies.find((c) => c.name === "bo_registration"),
      setup = begun.json();
    const complete = await app.inject({
      method: "POST",
      url: "/backoffice/api/register/complete",
      headers: {
        origin,
        "content-type": "application/json",
        cookie: reg.name + "=" + reg.value,
        "x-csrf-token": setup.csrf,
      },
      payload: {
        username: "invited-fixture",
        password: "Synthetic invited password 2026!",
        code: otp(setup.secret).generate(),
      },
    });
    assert.equal(complete.statusCode, 200, complete.body);
    const list = await req(admin, "/backoffice/api/customers");
    assert.equal(list.statusCode, 200, list.body);
    assert.ok(
      list
        .json()
        .find((v) => v.id === c.json().id)
        .assignments.some((v) => v.projectId === p.id),
    );
    const staff = await req(admin, "/backoffice/api/staff");
    assert.equal(staff.statusCode, 200, staff.body);
    assert.ok(
      staff
        .json()
        .every((v) => v.role === "Admin" && !Object.hasOwn(v, "protected")),
    );
  },
);
pgtest(
  "PostgreSQL: a real backup restores with the vault, reapplies newer deletions, and revokes old sessions",
  async () => {
    assert.ok(
      process.env.TEST_RESTORE_DATABASE_URL,
      "TEST_RESTORE_DATABASE_URL required alongside PostgreSQL integration tests",
    );
    const { backupPostgres, restorePostgres } =
      await import("../server/postgres-backup.mjs");
    const { writeFile, readFile } = await import("node:fs/promises");
    const { a, p } = fixtures,
      c = await create(a, p),
      keep = await create(a, p);
    await save(a, p, c, "Deleted after the snapshot");
    await save(a, p, keep, "Surviving encrypted content");
    await connectFixtureProject(p);
    const linked = await req(
      fixtures.admin,
      `/backoffice/api/projects/${p.id}/prompts/link`,
      "POST",
      { name: "Restored linked assistant", providerPromptId: "pmpt_restored" },
    );
    assert.equal(linked.statusCode, 200);
    const linkId = linked.json().id;
    const dir = await mkdtemp(join(tmpdir(), "ai-pg-restore-")),
      backup = join(dir, "backup"),
      journal = join(dir, "deletions.jsonl");
    const restore = openPostgres(process.env.TEST_RESTORE_DATABASE_URL);
    try {
      await writeFile(join(dir, "configured-vault.key"), key, { mode: 0o600 });
      await writeFile(journal, "", { mode: 0o600 });
      await backupPostgres({
        databaseUrl: uri("ai_migrator"),
        state: dir,
        destination: backup,
        vaultKeyFile: join(dir, "configured-vault.key"),
      });
      await req(a, url(p, c.id), "DELETE", {});
      await writeFile(
        journal,
        JSON.stringify({
          conversationId: c.id,
          customerId: a.customerId,
          projectId: p.id,
          deletedAt: Date.now(),
        }) + "\n",
        { mode: 0o600 },
      );
      await restore.transaction(async () => {
        await restore.query("SET LOCAL ROLE ai_owner");
        await restore.query(
          "DROP SCHEMA IF EXISTS private CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION ai_owner",
        );
      });
      const result = await restorePostgres({
        databaseUrl: process.env.TEST_RESTORE_DATABASE_URL,
        backup,
        journal,
      });
      assert.equal(result.deletionJournalApplied, true);
      assert.equal(result.schema, 8);
      assert.equal(
        (
          await restore.query(
            "SELECT provider_prompt_id FROM platform_prompt_links WHERE version_id=$1",
            [linkId],
          )
        ).rows[0].provider_prompt_id,
        "pmpt_restored",
      );
      assert.ok((await readFile(result.journalOutput, "utf8")).includes(c.id));
      await restore.transaction(async () => {
        await restore.query("SET LOCAL ROLE ai_owner");
        assert.equal(
          (
            await restore.query(
              "SELECT * FROM private.conversations WHERE id=$1",
              [c.id],
            )
          ).rows.length,
          0,
        );
        assert.equal(
          (await restore.query("SELECT * FROM sessions")).rows.length,
          0,
        );
        const [message] = (
          await restore.query(
            "SELECT * FROM private.messages WHERE conversation_id=$1",
            [keep.id],
          )
        ).rows;
        assert.equal(
          unseal(
            await readFile(join(backup, "vault.key")),
            message.body_secret,
            `chat-message:${a.customerId}:${p.id}:${keep.id}:${message.id}`,
          ),
          "Surviving encrypted content",
        );
      });
      await assert.rejects(
        restorePostgres({
          databaseUrl: process.env.TEST_RESTORE_DATABASE_URL,
          backup,
        }),
        /journal is required/,
      );
    } finally {
      await restore.close();
      await rm(dir, { recursive: true, force: true });
    }
  },
);
pgtest(
  "PostgreSQL: a staff mutation queued after authentication rechecks permission under the transaction lock",
  async () => {
    const { admin, p } = fixtures;
    let entered, release;
    const reached = new Promise((r) => (entered = r)),
      gate = new Promise((r) => (release = r)),
      original = app.db.transaction;
    app.db.transaction = async (fn) => {
      entered();
      await gate;
      return original(fn);
    };
    const updating = req(admin, "/backoffice/api/projects/" + p.id, "PUT", {
      name: "Should not persist",
      description: "",
      connectionId: null,
      enabled: true,
    });
    await reached;
    await maintenance(async () => {
      await q("UPDATE admins SET status='paused' WHERE id=$1", [admin.id]);
      await q("DELETE FROM sessions WHERE admin_id=$1", [admin.id]);
    });
    release();
    const response = await updating;
    assert.equal(response.statusCode, 401, response.body);
    await maintenance(async () =>
      assert.notEqual(
        (await q("SELECT name FROM projects WHERE id=$1", [p.id]))[0].name,
        "Should not persist",
      ),
    );
  },
);
pgtest(
  "PostgreSQL: passive membership polling does not extend idle sessions, while deliberate history access does",
  async () => {
    const { a, p } = fixtures,
      seen = Date.now() - 25 * 60 * 1000;
    await maintenance(() =>
      q("UPDATE sessions SET seen=$1 WHERE hash=$2", [seen, digest(a.raw)]),
    );
    assert.equal((await req(a, "/api/customer/projects")).statusCode, 200);
    await maintenance(async () =>
      assert.equal(
        (await q("SELECT seen FROM sessions WHERE hash=$1", [digest(a.raw)]))[0]
          .seen,
        seen,
      ),
    );
    assert.equal((await req(a, url(p))).statusCode, 200);
    await maintenance(async () =>
      assert.ok(
        (await q("SELECT seen FROM sessions WHERE hash=$1", [digest(a.raw)]))[0]
          .seen > seen,
      ),
    );
    await maintenance(() =>
      q("UPDATE sessions SET seen=$1 WHERE hash=$2", [
        Date.now() - 31 * 60 * 1000,
        digest(a.raw),
      ]),
    );
    assert.equal((await req(a, "/api/customer/projects")).statusCode, 401);
  },
);

pgtest(
  "PostgreSQL: connection setup creates one linked app project and legacy opening is idempotent under concurrent requests",
  async () => {
    const { admin } = fixtures;
    let checks = 0;
    await app.close();
    app = await buildServer({
      database: openPostgres(uri("ai_control")),
      customerDatabase: openPostgres(uri("ai_chat")),
      vaultKey: key,
      origin,
      providerCheck: async () => {
        checks++;
        return "ok";
      },
      mailer: async () => {
        throw new Error("No fixture email");
      },
    });
    const connection = await req(admin, "/backoffice/api/connections", "POST", {
      label: "Synthetic imported project",
      projectRef: "proj_synthetic_import",
      environment: "test",
      apiKey: "sk-proj-synthetic-test-credential-never-sent-to-provider",
    });
    assert.equal(connection.statusCode, 200, connection.body);
    const { id, projectId, projectCreated } = connection.json();
    assert.equal(projectCreated, true);
    assert.deepEqual(
      await q("SELECT id,name,connection_id FROM projects WHERE id=$1", [
        projectId,
      ]),
      [
        {
          id: projectId,
          name: "Synthetic imported project",
          connection_id: id,
        },
      ],
    );
    assert.equal(
      (
        await q("SELECT id FROM prompt_versions WHERE project_id=$1", [
          projectId,
        ])
      ).length,
      0,
    );
    const open = () =>
      req(admin, `/backoffice/api/connections/${id}/project`, "POST", {});
    assert.deepEqual((await open()).json(), {
      projectId,
      projectCreated: false,
    });
    await maintenance(() => q("DELETE FROM projects WHERE id=$1", [projectId]));
    const results = await Promise.all([open(), open(), open()]);
    assert.ok(results.every((r) => r.statusCode === 200));
    assert.equal(new Set(results.map((r) => r.json().projectId)).size, 1);
    assert.equal(results.filter((r) => r.json().projectCreated).length, 1);
    const importResult = await req(
      admin,
      `/backoffice/api/projects/${results[0].json().projectId}/prompts/import`,
      "POST",
      {
        projectRef: "proj_synthetic_import",
        prompts: [
          {
            name: "Bound source",
            instructions: "Synthetic source content",
            sourceRef: "pmpt_synthetic v2",
          },
        ],
      },
    );
    assert.equal(importResult.statusCode, 200, importResult.body);
    assert.equal(importResult.json().imported, 1);
    assert.equal(checks, 1);
  },
);

pgtest(
  "PostgreSQL: concurrent one-time imports preserve source, immutable versions, pinned histories and Admin/Customer boundaries",
  async () => {
    const { admin, main, a, p, other } = fixtures,
      c = await create(a, p);
    await save(a, p, c);
    const route = `/backoffice/api/projects/${p.id}/prompts/import`;
    const item = {
      name: "Imported synthetic prompt",
      instructions:
        "  Original synthetic instructions\r\n<script>literal</script>\n",
      sourceRef: "pmpt_synthetic v4",
    };
    const body = { prompts: [item] };
    assert.equal((await req(a, route, "POST", body)).statusCode, 403);
    assert.equal(
      (await req({ headers: { origin } }, route, "POST", body)).statusCode,
      401,
    );
    const missingCsrf = {
      ...admin,
      headers: { ...admin.headers, "x-csrf-token": "bad" },
    };
    assert.equal((await req(missingCsrf, route, "POST", body)).statusCode, 403);
    const results = await Promise.all([
      req(admin, route, "POST", body),
      req(main, route, "POST", body),
    ]);
    assert.ok(results.every((r) => r.statusCode === 200));
    assert.deepEqual(results.map((r) => r.json().imported).sort(), [0, 1]);
    const [stored] = await q(
      "SELECT * FROM prompt_versions WHERE project_id=$1 AND name=$2",
      [p.id, item.name],
    );
    assert.equal(stored.version, 1);
    assert.equal(stored.source_ref, item.sourceRef);
    assert.equal(stored.checksum, digest(item.instructions));
    assert.equal(
      unseal(key, stored.instructions, "prompt:" + stored.id),
      item.instructions,
    );
    assert.ok(!stored.instructions.includes("Original synthetic"));
    assert.equal(
      (
        await q(
          "SELECT version_id FROM assignments WHERE customer_id=$1 AND project_id=$2",
          [a.customerId, p.id],
        )
      )[0].version_id,
      p.v,
    );
    await save(a, p, c, "Existing pinned conversation still accepts messages");
    assert.equal((await req(admin, url(p, c.id))).statusCode, 404);
    assert.equal((await req(main, url(p, c.id))).statusCode, 404);
    const conflict = await req(admin, route, "POST", {
      prompts: [
        { name: "Rollback me", instructions: "Synthetic" },
        { ...item, instructions: "Different" },
      ],
    });
    assert.equal(conflict.statusCode, 409);
    assert.equal(
      (await q("SELECT id FROM prompt_versions WHERE name='Rollback me'"))
        .length,
      0,
    );
    assert.equal(
      (
        await req(
          admin,
          `/backoffice/api/projects/${other.id}/prompts/import`,
          "POST",
          body,
        )
      ).json().imported,
      1,
    );
    assert.equal(
      (await req(admin, route, "POST", { ...body, projectRef: "proj_wrong" }))
        .statusCode,
      400,
    );
    assert.ok(
      !(await req(admin, "/backoffice/api/audit")).body.includes(
        item.instructions,
      ),
    );
  },
);

async function connectFixtureProject(p) {
  const id = randomUUID(),
    now = new Date().toISOString();
  await maintenance(async () => {
    await q(
      "INSERT INTO connections VALUES($1,'Synthetic connection','proj_synthetic','test',$2,'test',1,1,'ok',$3,$3,$3)",
      [
        id,
        seal(key, "sk-proj-synthetic-not-sent-to-openai", "connection:" + id),
        now,
      ],
    );
    await q("UPDATE projects SET connection_id=$1 WHERE id=$2", [id, p.id]);
  });
  return id;
}
pgtest(
  "PostgreSQL: Platform links are immutable, project-bound, private to Admins and preserve assigned chats",
  async () => {
    const { admin, main, a, p, other } = fixtures;
    const connectionId = await connectFixtureProject(p),
      old = await create(a, p);
    await save(a, p, old);
    const path = `/backoffice/api/projects/${p.id}/prompts/link`,
      payload = {
        name: "Linked assistant",
        providerPromptId: "pmpt_synthetic",
      };
    assert.equal((await req(a, path, "POST", payload)).statusCode, 403);
    const results = await Promise.all([
      req(admin, path, "POST", payload),
      req(main, path, "POST", payload),
    ]);
    assert.ok(results.every((r) => r.statusCode === 200));
    assert.equal(results.filter((r) => r.json().created).length, 1);
    const id = results[0].json().id;
    assert.equal(results[1].json().id, id);
    assert.deepEqual(
      await q("SELECT * FROM platform_prompt_links WHERE version_id=$1", [id]),
      [
        {
          version_id: id,
          project_id: p.id,
          connection_id: connectionId,
          provider_prompt_id: payload.providerPromptId,
          version_policy: "default",
        },
      ],
    );
    assert.equal(
      (
        await q(
          "SELECT version_id FROM assignments WHERE customer_id=$1 AND project_id=$2",
          [a.customerId, p.id],
        )
      )[0].version_id,
      p.v,
    );
    await save(a, p, old, "Original pinned assignment still works");
    const metadata = (await req(admin, "/backoffice/api/prompts/" + id)).json();
    assert.equal(metadata.source_kind, "platform");
    assert.ok(!Object.hasOwn(metadata, "instructions"));
    assert.equal(
      (
        await req(admin, "/backoffice/api/prompts", "POST", {
          projectId: p.id,
          promptId: metadata.prompt_id,
          name: metadata.name,
          instructions: "Must not edit remote config",
          sourceRef: "",
        })
      ).statusCode,
      400,
    );
    const chat = openPostgres(uri("ai_chat"));
    try {
      await assert.rejects(
        chat.query("SELECT * FROM platform_prompt_links"),
        (e) => e.code === "42501",
      );
    } finally {
      await chat.close();
    }
    await assert.rejects(
      app.db.query(
        "UPDATE platform_prompt_links SET provider_prompt_id='pmpt_override' WHERE version_id=$1",
        [id],
      ),
      (e) => e.code === "42501",
    );
    await assert.rejects(
      app.db.query("UPDATE projects SET connection_id=null WHERE id=$1", [
        p.id,
      ]),
      (e) => e.code === "23503",
    );
    await assert.rejects(
      app.db.query(
        "INSERT INTO platform_prompt_links VALUES($1,$2,$3,'pmpt_cross','default')",
        [other.v, other.id, connectionId],
      ),
      (e) => e.code === "23503",
    );
    await maintenance(() =>
      q(
        "UPDATE assignments SET version_id=$1 WHERE customer_id=$2 AND project_id=$3",
        [id, a.customerId, p.id],
      ),
    );
    assert.equal(
      (
        await req(a, url(p, old.id) + "/messages", "POST", {
          text: "Old chat read-only",
          requestId: randomUUID(),
        })
      ).statusCode,
      409,
    );
    const next = await create(a, p);
    await save(a, p, next, "Private saved message; live AI is still disabled");
    for (const who of [admin, main])
      assert.equal((await req(who, url(p, next.id))).statusCode, 404);
    assert.ok(
      !(await req(a, "/api/customer/projects")).body.includes("pmpt_synthetic"),
    );
  },
);

pgtest(
  "PostgreSQL: additive schema 3 to 8 migration preserves MFA, owner protection, sessions, vault ciphertext and private history",
  async () => {
    const { a, p, main } = fixtures,
      c = await create(a, p);
    await save(a, p, c, "Migration persistence fixture");
    const before = await q("SELECT * FROM admins ORDER BY id");
    const sessions = await q("SELECT * FROM sessions ORDER BY hash");
    const versions = await q("SELECT * FROM prompt_versions ORDER BY id");
    await maintenance(async () => {
      await q(
        "DROP FUNCTION public.chat_workspace_projects(); DROP TABLE project_appearance; DROP TABLE usage_reporting",
      );
      await q("DROP TABLE platform_prompt_links");
      await q("DROP INDEX project_connection_binding");
      await q("DELETE FROM schema_version WHERE version>=4");
      await q("DROP TABLE account_profiles,admin_workspaces");
      const schema = await readFile(
        new URL("../server/schema.sql", import.meta.url),
        "utf8",
      );
      const legacyFunction = schema.slice(
        schema.indexOf("CREATE FUNCTION public.chat_customer()"),
        schema.indexOf("CREATE FUNCTION public.chat_access("),
      );
      await q(
        legacyFunction.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION"),
      );
    });
    const { backupPostgres, restorePostgres } =
      await import("../server/postgres-backup.mjs");
    const { writeFile } = await import("node:fs/promises");
    const dir = await mkdtemp(join(tmpdir(), "ai-schema3-backup-"));
    const restore = openPostgres(process.env.TEST_RESTORE_DATABASE_URL);
    try {
      await writeFile(join(dir, "vault.key"), key, { mode: 0o600 });
      const journal = join(dir, "deletions.jsonl");
      await writeFile(journal, "", { mode: 0o600 });
      const manifest = await backupPostgres({
        databaseUrl: uri("ai_migrator"),
        state: dir,
        destination: join(dir, "backup"),
      });
      assert.equal(manifest.schema, 3);
      await restore.transaction(async () => {
        await restore.query("SET LOCAL ROLE ai_owner");
        await restore.query(
          "DROP SCHEMA IF EXISTS private CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION ai_owner",
        );
      });
      const result = await restorePostgres({
        databaseUrl: process.env.TEST_RESTORE_DATABASE_URL,
        backup: join(dir, "backup"),
        journal,
      });
      assert.equal(result.schema, 3);
      assert.deepEqual(await migrate(restore), { schema: 8, imported: false });
      assert.deepEqual(
        (await restore.query("SELECT * FROM admins ORDER BY id")).rows,
        before,
      );
      await restore.transaction(async () => {
        await restore.query("SET LOCAL ROLE ai_owner");
        assert.equal(
          (
            await restore.query(
              "SELECT count(*) AS n FROM private.messages WHERE conversation_id=$1",
              [c.id],
            )
          ).rows[0].n,
          1,
        );
      });
    } finally {
      await restore.close();
      await rm(dir, { recursive: true, force: true });
    }
    assert.deepEqual(await migrate(owner), { schema: 8, imported: false });
    assert.deepEqual(await migrate(owner), { schema: 8, imported: false });
    assert.deepEqual(await q("SELECT * FROM admins ORDER BY id"), before);
    assert.deepEqual(await q("SELECT * FROM sessions ORDER BY hash"), sessions);
    assert.deepEqual(
      await q("SELECT * FROM prompt_versions ORDER BY id"),
      versions,
    );
    assert.equal((await req(a, url(p, c.id))).statusCode, 200);
    assert.equal((await req(main, url(p, c.id))).statusCode, 404);
    await assert.rejects(
      app.db.query("UPDATE admins SET protected=0 WHERE id=$1", [main.id]),
      (e) => e.code === "23514",
    );
    assert.equal(
      (await q("SELECT count(*) AS n FROM platform_prompt_links"))[0].n,
      0,
    );
  },
);

pgtest(
  "PostgreSQL: schema 4 upgrade and schema 8 restore preserve identities, profiles, project colours and private Admin history",
  async () => {
    const { main, p } = fixtures;
    const before = await q("SELECT * FROM admins ORDER BY id");
    const sessions = await q("SELECT * FROM sessions ORDER BY hash");
    await maintenance(async () => {
      await q("DROP TABLE account_profiles,admin_workspaces");
      await q(
        "DROP FUNCTION public.chat_workspace_projects(); DROP TABLE project_appearance; DROP TABLE usage_reporting",
      );
      await q("DELETE FROM schema_version WHERE version>=5");
      const schema = await readFile(
        new URL("../server/schema.sql", import.meta.url),
        "utf8",
      );
      const legacyFunction = schema.slice(
        schema.indexOf("CREATE FUNCTION public.chat_customer()"),
        schema.indexOf("CREATE FUNCTION public.chat_access("),
      );
      await q(
        legacyFunction.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION"),
      );
    });
    assert.deepEqual(await migrate(owner), { schema: 8, imported: false });
    assert.deepEqual(await q("SELECT * FROM admins ORDER BY id"), before);
    assert.deepEqual(await q("SELECT * FROM sessions ORDER BY hash"), sessions);
    assert.equal(
      (
        await req(main, `/backoffice/api/staff/${main.id}/workspace`, "PUT", {
          allowance: 500,
          assignments: [{ projectId: p.id, versionId: p.v }],
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await req(main, "/api/account/profile", "PUT", {
          name: "Personal protected display",
        })
      ).statusCode,
      200,
    );
    const c = await create(main, p);
    await save(main, p, c, "Private Admin recovery fixture");
    await maintenance(() =>
      q("INSERT INTO project_appearance VALUES($1,'#f08a24')", [p.id]),
    );
    const reportingSecret = seal(
      key,
      "sk-admin-synthetic-recovery-fixture",
      "usage-reporting:1",
    );
    await maintenance(() =>
      q(
        "INSERT INTO usage_reporting VALUES(1,'Synthetic reports',$1,'ture',1,$2)",
        [reportingSecret, new Date().toISOString()],
      ),
    );
    const { backupPostgres, restorePostgres } =
      await import("../server/postgres-backup.mjs");
    const { writeFile } = await import("node:fs/promises");
    const dir = await mkdtemp(join(tmpdir(), "ai-account-recovery-"));
    const restore = openPostgres(process.env.TEST_RESTORE_DATABASE_URL);
    try {
      await writeFile(join(dir, "vault.key"), key, { mode: 0o600 });
      const journal = join(dir, "deletions.jsonl");
      await writeFile(journal, "", { mode: 0o600 });
      assert.equal(
        (
          await backupPostgres({
            databaseUrl: uri("ai_migrator"),
            state: dir,
            destination: join(dir, "backup"),
          })
        ).schema,
        8,
      );
      await restore.transaction(async () => {
        await restore.query("SET LOCAL ROLE ai_owner");
        await restore.query(
          "DROP SCHEMA IF EXISTS private CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION ai_owner",
        );
      });
      assert.equal(
        (
          await restorePostgres({
            databaseUrl: process.env.TEST_RESTORE_DATABASE_URL,
            backup: join(dir, "backup"),
            journal,
          })
        ).schema,
        8,
      );
      await restore.transaction(async () => {
        await restore.query("SET LOCAL ROLE ai_owner");
        assert.deepEqual(
          (await restore.query("SELECT * FROM admins ORDER BY id")).rows,
          before,
        );
        assert.equal(
          (
            await restore.query(
              "SELECT color FROM project_appearance WHERE project_id=$1",
              [p.id],
            )
          ).rows[0].color,
          "#f08a24",
        );
        assert.equal(
          (await restore.query("SELECT key_secret FROM usage_reporting"))
            .rows[0].key_secret,
          reportingSecret,
        );
        assert.equal(
          (
            await restore.query(
              "SELECT display_name FROM account_profiles WHERE account_id=$1",
              [main.id],
            )
          ).rows[0].display_name,
          "Personal protected display",
        );
        assert.equal(
          (
            await restore.query(
              "SELECT count(*) AS n FROM admin_workspaces WHERE account_id=$1",
              [main.id],
            )
          ).rows[0].n,
          1,
        );
        const message = (
          await restore.query(
            "SELECT * FROM private.messages WHERE conversation_id=$1",
            [c.id],
          )
        ).rows[0];
        assert.equal(
          unseal(
            key,
            message.body_secret,
            `chat-message:${message.customer_id}:${message.project_id}:${message.conversation_id}:${message.id}`,
          ),
          "Private Admin recovery fixture",
        );
        assert.equal(
          (await restore.query("SELECT count(*) AS n FROM sessions")).rows[0].n,
          0,
        );
      });
    } finally {
      await restore.close();
      await rm(dir, { recursive: true, force: true });
    }
  },
);
