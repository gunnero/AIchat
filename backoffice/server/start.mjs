import { mkdir, readFile, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { buildServer } from "./app.mjs";
import { localMailer } from "./mail.mjs";
import { digest } from "./security.mjs";
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
const app = await buildServer({
  dbPath: state + "/backoffice.sqlite",
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
console.log("Administrator service is listening on loopback.");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
