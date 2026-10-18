// Runs only against the two operator-marked synthetic databases, never live data.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { openPostgres } from "./postgres.mjs";
import { migrate } from "./migrate.mjs";
import { backupPostgres, restorePostgres } from "./postgres-backup.mjs";
import {
  seal,
  unseal,
  hashPassword,
  verifyPassword,
  newOtpSecret,
  otp,
} from "./security.mjs";

process.umask(0o077);
const execute = promisify(execFile);
const work = resolve(process.argv[2]);
const sourceUrl =
  process.env.OPERATIONS_DRILL_SOURCE_URL ||
  "postgresql://ai_migrator@localhost/ai_ops_probe?host=/run/postgresql-ai&port=5433";
const restoreUrl =
  process.env.OPERATIONS_DRILL_RESTORE_URL ||
  "postgresql://ai_migrator@localhost/ai_ops_restore?host=/run/postgresql-ai&port=5433";
for (const [url, name] of [
  [sourceUrl, "ai_ops_probe"],
  [restoreUrl, "ai_ops_restore"],
])
  assert.equal(
    new URL(url).pathname,
    "/" + name,
    "Synthetic drill database required",
  );
const source = openPostgres(sourceUrl),
  restored = openPostgres(restoreUrl);
const asOwner = (db, fn) =>
  db.transaction(async () => {
    await db.query("SET LOCAL ROLE ai_owner");
    return fn(db);
  });
try {
  for (const db of [source, restored])
    assert.equal(
      (await db.query("SELECT to_regclass('public.schema_version') AS name"))
        .rows[0].name,
      null,
      "Drill databases must be empty",
    );
  await migrate(source);
  const key = randomBytes(32),
    admin = randomUUID(),
    customer = randomUUID(),
    project = randomUUID(),
    version = randomUUID();
  const keep = randomUUID(),
    deleted = randomUUID(),
    message = randomUUID(),
    deletedMessage = randomUUID(),
    now = Date.now();
  const secret = newOtpSecret(),
    password = "Synthetic recovery test password 2026!";
  const hash = await hashPassword(password),
    cipher = seal(key, secret, "mfa:" + admin);
  await asOwner(source, async (db) => {
    await db.query(
      "INSERT INTO admins(id,email,name,username,role,protected,status,password_hash,mfa_secret,created_at) VALUES($1,'drill@example.test','Synthetic owner','synthetic-owner','admin',1,'active',$2,$3,$4)",
      [admin, hash, cipher, new Date().toISOString()],
    );
    await db.query(
      "INSERT INTO sessions VALUES('synthetic-session',$1,$2,$2,$3,$2)",
      [admin, now, now + 60000],
    );
    await db.query(
      "INSERT INTO customers VALUES($1,'Synthetic customer','customer@example.test','active',null,100,$2,$2)",
      [customer, new Date().toISOString()],
    );
    await db.query(
      "INSERT INTO projects VALUES($1,'Synthetic project','Recovery test',null,1,$2,$2)",
      [project, new Date().toISOString()],
    );
    await db.query(
      "INSERT INTO prompt_versions VALUES($1,$2,$3,'Synthetic prompt',1,$4,'fixture','checksum',$5)",
      [
        version,
        project,
        randomUUID(),
        seal(key, "Synthetic instructions", "prompt:" + version),
        new Date().toISOString(),
      ],
    );
    for (const id of [keep, deleted])
      await db.query(
        "INSERT INTO private.conversations VALUES($1,$2,$3,$4,$5,false,$6,$6,$7)",
        [
          id,
          customer,
          project,
          version,
          seal(key, "Synthetic title", "drill-title:" + id),
          now,
          randomUUID(),
        ],
      );
    for (const [id, conversation] of [
      [message, keep],
      [deletedMessage, deleted],
    ])
      await db.query(
        "INSERT INTO private.messages VALUES($1,$2,$3,$4,1,$5,$6,$7)",
        [
          id,
          customer,
          project,
          conversation,
          randomUUID(),
          seal(key, "Synthetic recovery message", "drill-body:" + id),
          now,
        ],
      );
  });
  await writeFile(join(work, "vault.key"), key, { mode: 0o600 });
  const journal = join(work, "deletions.jsonl");
  await writeFile(journal, "", { mode: 0o600 });
  const backup = join(work, "backup");
  await backupPostgres({
    databaseUrl: sourceUrl,
    state: work,
    destination: backup,
    vaultKeyFile: join(work, "vault.key"),
  });
  await asOwner(source, (db) =>
    db.query("DELETE FROM private.conversations WHERE id=$1", [deleted]),
  );
  await writeFile(
    journal,
    JSON.stringify({
      conversationId: deleted,
      customerId: customer,
      projectId: project,
      deletedAt: now + 1,
    }) + "\n",
    { mode: 0o600 },
  );
  // An ephemeral drill identity proves the complete cipher/archive/restore path.
  // The real recovery private key stays off the server.
  await execute(process.env.AGE_KEYGEN || "age-keygen", [
    "-o",
    join(work, "drill-identity.txt"),
  ]);
  const { stdout: recipient } = await execute(
    process.env.AGE_KEYGEN || "age-keygen",
    ["-y", join(work, "drill-identity.txt")],
  );
  const files = [
    "database.dump",
    "vault.key",
    "deletions.jsonl",
    "manifest.json",
  ];
  await execute("tar", [
    "-C",
    backup,
    "-cf",
    join(work, "backup.tar"),
    ...files,
  ]);
  await execute(process.env.AGE || "age", [
    "-r",
    recipient.trim(),
    "-o",
    join(work, "backup.tar.age"),
    join(work, "backup.tar"),
  ]);
  await execute(process.env.AGE || "age", [
    "-r",
    recipient.trim(),
    "-o",
    join(work, "journal.age"),
    journal,
  ]);
  await execute(process.env.AGE || "age", [
    "-d",
    "-i",
    join(work, "drill-identity.txt"),
    "-o",
    join(work, "recovered.tar"),
    join(work, "backup.tar.age"),
  ]);
  await execute(process.env.AGE || "age", [
    "-d",
    "-i",
    join(work, "drill-identity.txt"),
    "-o",
    join(work, "latest.jsonl"),
    join(work, "journal.age"),
  ]);
  const recovered = join(work, "recovered");
  await mkdir(recovered, { mode: 0o700 });
  await execute("tar", ["-C", recovered, "-xf", join(work, "recovered.tar")]);
  await restorePostgres({
    databaseUrl: restoreUrl,
    backup: recovered,
    journal: join(work, "latest.jsonl"),
  });
  const recoveredKey = await readFile(join(recovered, "vault.key"));
  assert.deepEqual(recoveredKey, key);
  const account = (
    await restored.query("SELECT * FROM admins WHERE id=$1", [admin])
  ).rows[0];
  assert.equal(account.password_hash, hash);
  assert.ok(await verifyPassword(password, account.password_hash));
  const recoveredSecret = unseal(
    recoveredKey,
    account.mfa_secret,
    "mfa:" + admin,
  );
  assert.equal(
    otp(recoveredSecret).generate({ timestamp: now }),
    otp(secret).generate({ timestamp: now }),
  );
  await assert.rejects(
    restored.query("UPDATE admins SET status='paused' WHERE id=$1", [admin]),
    (e) => e.code === "23514",
  );
  await asOwner(restored, async (db) => {
    assert.equal(
      (
        await db.query(
          "SELECT count(*) AS n FROM private.conversations WHERE id=$1",
          [deleted],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query(
          "SELECT count(*) AS n FROM private.messages WHERE id=$1",
          [deletedMessage],
        )
      ).rows[0].n,
      0,
    );
    const conversation = (
      await db.query(
        "SELECT title_secret FROM private.conversations WHERE id=$1",
        [keep],
      )
    ).rows[0];
    assert.equal(
      unseal(recoveredKey, conversation.title_secret, "drill-title:" + keep),
      "Synthetic title",
    );
    const row = (
      await db.query("SELECT body_secret FROM private.messages WHERE id=$1", [
        message,
      ])
    ).rows[0];
    assert.equal(
      unseal(recoveredKey, row.body_secret, "drill-body:" + message),
      "Synthetic recovery message",
    );
    assert.equal(
      (await db.query("SELECT count(*) AS n FROM sessions")).rows[0].n,
      0,
    );
  });
  console.log(
    JSON.stringify({
      synthetic: true,
      restored: true,
      deletedChatAbsent: true,
      mfaPreserved: true,
      ownerProtected: true,
    }),
  );
} finally {
  await source.close();
  await restored.close();
}
