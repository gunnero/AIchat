import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
process.umask(0o077);
const directory = resolve(process.env.STATE_DIR || ".state");
await mkdir(directory, { recursive: true, mode: 0o700 });
// Exclusive creation: never replace a master key protecting existing records.
await writeFile(directory + "/vault.key", randomBytes(32), {
  flag: "wx",
  mode: 0o600,
});
await writeFile(
  directory + "/bootstrap.token",
  randomBytes(32).toString("base64url"),
  { flag: "wx", mode: 0o600 },
);
console.log("Private vault initialized. Existing keys are never overwritten.");
