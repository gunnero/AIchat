import {
  mkdir,
  readFile,
  writeFile,
  copyFile,
  chmod,
  stat,
  open,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { openPostgres } from "./postgres.mjs";
const execute = promisify(execFile);
const checksum = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function schemaVersion(databaseUrl) {
  const db = openPostgres(databaseUrl);
  try {
    const version = (
      await db.query("SELECT max(version) AS v FROM schema_version")
    ).rows[0].v;
    if (![3, 4, 5, 6].includes(version))
      throw new Error("Unsupported backup schema");
    return version;
  } finally {
    await db.close();
  }
}
async function command(name, args) {
  try {
    await execute(name, args, { maxBuffer: 1024 * 1024 });
  } catch {
    throw new Error(
      "PostgreSQL backup/restore command failed; private diagnostics suppressed",
    );
  }
}
export async function backupPostgres({ databaseUrl, state, destination }) {
  if (resolve(state) === resolve(destination))
    throw new Error("Specify a new private backup directory");
  const schema = await schemaVersion(databaseUrl);
  await mkdir(destination, { mode: 0o700 });
  await command(process.env.PG_DUMP || "pg_dump", [
    "--dbname=" + databaseUrl,
    "--format=custom",
    "--no-owner",
    "--file=" + join(destination, "database.dump"),
  ]);
  if ((await schemaVersion(databaseUrl)) !== schema)
    throw new Error("Database schema changed during backup");
  await copyFile(join(state, "vault.key"), join(destination, "vault.key"));
  try {
    await copyFile(
      join(state, "deletions.jsonl"),
      join(destination, "deletions.jsonl"),
    );
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    await writeFile(join(destination, "deletions.jsonl"), "");
  }
  const manifest = {
    schema,
    createdAt: new Date().toISOString(),
    files: {},
  };
  for (const name of ["database.dump", "vault.key", "deletions.jsonl"]) {
    await chmod(join(destination, name), 0o600);
    manifest.files[name] = checksum(await readFile(join(destination, name)));
  }
  await writeFile(
    join(destination, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    { mode: 0o600 },
  );
  return manifest;
}
export async function restorePostgres({ databaseUrl, backup, journal }) {
  if (!journal)
    throw new Error("The latest independent deletion journal is required");
  const info = await stat(journal);
  if (!info.isFile() || (info.mode & 0o077) !== 0)
    throw new Error("Deletion journal must be private");
  const manifest = JSON.parse(
    await readFile(join(backup, "manifest.json"), "utf8"),
  );
  if (![3, 4, 5, 6].includes(manifest.schema))
    throw new Error("Unsupported backup");
  for (const name of ["database.dump", "vault.key", "deletions.jsonl"])
    if (manifest.files[name] !== checksum(await readFile(join(backup, name))))
      throw new Error("Backup checksum mismatch");
  const records = [
    ...(await readFile(join(backup, "deletions.jsonl"), "utf8")).split("\n"),
    ...(await readFile(journal, "utf8")).split("\n"),
  ]
    .filter(Boolean)
    .map((line) => {
      const r = JSON.parse(line);
      if (
        ![r.conversationId, r.customerId, r.projectId].every(
          (v) => typeof v === "string" && /^[0-9a-f-]{36}$/.test(v),
        ) ||
        !Number.isSafeInteger(r.deletedAt)
      )
        throw new Error("Invalid deletion journal");
      return r;
    });
  const db = openPostgres(databaseUrl);
  try {
    if (
      (await db.query("SELECT to_regclass('public.schema_version') AS name"))
        .rows[0].name
    )
      throw new Error("Restore requires an empty isolated database");
    await command(process.env.PG_RESTORE || "pg_restore", [
      "--dbname=" + databaseUrl,
      "--role=ai_owner",
      "--no-owner",
      "--exit-on-error",
      join(backup, "database.dump"),
    ]);
    if ((await schemaVersion(databaseUrl)) !== manifest.schema)
      throw new Error("Backup schema mismatch");
    const journalOutput = journal + ".replayed";
    await db.transaction(async () => {
      await db.query("SET LOCAL ROLE ai_owner");
      // Merge the DB ledger too, then replay the independent journal. A restore
      // stays offline until this transaction and verification both succeed.
      for (const r of records)
        await db.query(
          "INSERT INTO private.deletions VALUES($1,$2,$3,$4) ON CONFLICT(conversation_id) DO NOTHING",
          [r.conversationId, r.customerId, r.projectId, r.deletedAt],
        );
      await db.query(
        "DELETE FROM private.conversations c USING private.deletions d WHERE c.id=d.conversation_id AND c.customer_id=d.customer_id AND c.project_id=d.project_id",
      );
      await db.query("DELETE FROM sessions");
      await db.query("DELETE FROM setup_sessions");
      await db.query("DELETE FROM registrations");
      if (
        (
          await db.query(
            "SELECT count(*) AS n FROM private.conversations c JOIN private.deletions d ON d.conversation_id=c.id",
          )
        ).rows[0].n !== 0
      )
        throw new Error("Deletion replay failed");
      const ledger = (
        await db.query(
          'SELECT conversation_id AS "conversationId",customer_id AS "customerId",project_id AS "projectId",deleted_at AS "deletedAt" FROM private.deletions ORDER BY deleted_at,conversation_id',
        )
      ).rows;
      const merged = await open(journalOutput, "wx", 0o600);
      try {
        await merged.writeFile(
          ledger.map((r) => JSON.stringify(r)).join("\n") +
            (ledger.length ? "\n" : ""),
        );
        await merged.sync();
      } finally {
        await merged.close();
      }
    });
    return {
      schema: manifest.schema,
      deletionJournalApplied: true,
      sessionsRevoked: true,
      journalOutput,
    };
  } finally {
    await db.close();
  }
}
