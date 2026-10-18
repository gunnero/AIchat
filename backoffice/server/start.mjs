import { mkdir, readFile, stat, open } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { buildServer } from "./app.mjs";
import { localMailer } from "./mail.mjs";
import { digest } from "./security.mjs";
import { openPostgres } from "./postgres.mjs";
process.umask(0o077);
const state = resolve(process.env.STATE_DIR || ".state");
await mkdir(state, { recursive: true, mode: 0o700 });
const keyPath = resolve(process.env.VAULT_KEY_FILE || state + "/vault.key");
const info = await stat(keyPath);
if (!info.isFile() || (info.mode & 0o077) !== 0)
  throw new Error("Vault key file must be private (0600)");
const key = await readFile(keyPath);
if (key.length !== 32) throw new Error("Vault key must contain 32 bytes");
const publicOrigin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:8765";
const port = Number(process.env.PORT || 8765);
let bootstrapHash;
try {
  const bootstrapPath = state + "/bootstrap.token";
  const info = await stat(bootstrapPath);
  if (!info.isFile() || (info.mode & 0o077) !== 0)
    throw new Error("Unsafe setup token permissions");
  bootstrapHash = digest((await readFile(bootstrapPath, "utf8")).trim());
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (!process.env.CONTROL_DATABASE_URL || !process.env.CHAT_DATABASE_URL)
  throw new Error(
    "Both PostgreSQL application connections are required; SQLite fallback is disabled",
  );
const database = openPostgres(process.env.CONTROL_DATABASE_URL);
const customerDatabase = openPostgres(process.env.CHAT_DATABASE_URL);
for (const [db, expected] of [
  [database, "ai_control"],
  [customerDatabase, "ai_chat"],
]) {
  const {
    rows: [role],
  } = await db.query(
    "SELECT current_user AS name,rolsuper,rolbypassrls,pg_has_role(current_user,'ai_owner','MEMBER') AS owner FROM pg_roles WHERE rolname=current_user",
  );
  if (
    role.name !== expected ||
    role.rolsuper ||
    role.rolbypassrls ||
    role.owner
  )
    throw new Error("Unsafe database application role");
}
if (
  (await database.query("SELECT max(version) AS v FROM schema_version")).rows[0]
    .v !== 6
)
  throw new Error("Database migration required");
const app = await buildServer({
  database,
  customerDatabase,
  customerRoot: resolve(dirname(new URL(import.meta.url).pathname), "../dist"),
  deletionJournal: async (record) => {
    const file = await open(state + "/deletions.jsonl", "a", 0o600);
    try {
      await file.writeFile(JSON.stringify(record) + "\n");
      await file.sync();
    } finally {
      await file.close();
    }
  },
  vaultKey: key,
  bootstrapHash,
  mailer: process.env.MAIL_FROM
    ? localMailer(process.env.MAIL_FROM)
    : async () => false,
  origin: publicOrigin,
  localOrigin: process.env.LOCAL_SETUP_ORIGIN || `http://127.0.0.1:${port}`,
  secureCookies: publicOrigin.startsWith("https:"),
  staticRoot: resolve(dirname(new URL(import.meta.url).pathname), "../dist"),
});
await app.listen({ host: "127.0.0.1", port });
console.log("Customer and administrator service is listening on loopback.");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
