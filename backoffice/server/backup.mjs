import { mkdir, copyFile, writeFile, chmod } from "node:fs/promises";
import { resolve, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { backupPostgres } from "./postgres-backup.mjs";
process.umask(0o077);
const state = resolve(process.env.STATE_DIR || ".state");
const destination = resolve(process.argv[2] || "");
if (!process.argv[2] || destination === state)
  throw new Error("Specify a new private backup directory");
if (process.env.BACKUP_DATABASE_URL) {
  await backupPostgres({
    databaseUrl: process.env.BACKUP_DATABASE_URL,
    state,
    destination,
  });
  console.log(
    "Private PostgreSQL backup completed with vault and deletion ledger.",
  );
  process.exit(0);
}
if (process.env.LEGACY_SQLITE_BACKUP !== "1")
  throw new Error(
    "BACKUP_DATABASE_URL is required; legacy SQLite backups require explicit opt-in",
  );
await mkdir(destination, { mode: 0o700 });
const db = new DatabaseSync(join(state, "backoffice.sqlite"));
db.prepare("VACUUM INTO ?").run(join(destination, "backoffice.sqlite"));
const schema = db
  .prepare("SELECT max(version) AS version FROM schema_version")
  .get().version;
db.close();
await copyFile(
  resolve(process.env.VAULT_KEY_FILE || join(state, "vault.key")),
  join(destination, "vault.key"),
);
const manifest = { createdAt: new Date().toISOString(), schema, files: {} };
for (const name of ["backoffice.sqlite", "vault.key"]) {
  await chmod(join(destination, name), 0o600);
  manifest.files[name] = createHash("sha256")
    .update(await readFile(join(destination, name)))
    .digest("hex");
}
await writeFile(
  join(destination, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
  { mode: 0o600 },
);
console.log(
  "Consistent private backup completed. Keep the database and vault key together for restoration.",
);
