// Operator-only CLI. Human identity verification must happen independently first.
import { randomUUID } from "node:crypto";
import { open, stat, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { token, digest } from "./security.mjs";
import { openPostgres } from "./postgres.mjs";
export async function issueSupportGrant(
  db,
  { email, caseRef, now = Date.now() },
) {
  z.email().max(254).parse(email);
  z.uuid().parse(caseRef);
  const raw = token(),
    expires = now + 10 * 60000;
  await db.transaction(async () => {
    const {
      rows: [role],
    } = await db.query(
      "SELECT current_user AS name,pg_has_role(current_user,'ai_owner','MEMBER') AS owner",
    );
    if (role.name !== "ai_migrator" || !role.owner)
      throw Error("Maintenance operator required");
    await db.query("SET LOCAL ROLE ai_owner");
    const {
      rows: [account],
    } = await db.query(
      "SELECT a.id FROM admins a LEFT JOIN customers c ON c.id=a.customer_id WHERE a.email=$1 AND a.status='active' AND (a.role='admin' OR c.status='active')",
      [email.toLowerCase()],
    );
    if (!account) throw Error("An enrolled, active account is required");
    await db.query("DELETE FROM recovery_support WHERE account_id=$1", [
      account.id,
    ]);
    await db.query("INSERT INTO recovery_support VALUES($1,$2,$3,$4,$5)", [
      randomUUID(),
      account.id,
      digest("support:" + account.id + ":" + raw),
      expires,
      caseRef,
    ]);
    await db.query("INSERT INTO audit VALUES($1,NULL,$2,$3,$4)", [
      randomUUID(),
      "account.recovery_support_issued",
      account.id,
      new Date(now).toISOString(),
    ]);
  });
  return { code: raw, expires };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.umask(0o077);
  const [email, caseRef, file] = process.argv.slice(2);
  if (!file || process.argv.length !== 5)
    throw Error(
      "Provide registered email, verified-case UUID and a new private output file",
    );
  const output = resolve(file),
    info = await stat(dirname(output));
  if (!info.isDirectory() || info.mode & 0o077 || info.uid !== process.getuid())
    throw Error("Output requires an operator-owned private directory");
  const fileHandle = await open(output, "wx", 0o600);
  const db = openPostgres(
    process.env.MIGRATION_DATABASE_URL ||
      "postgresql://ai_migrator@localhost/ai_customer?host=/run/postgresql-ai&port=5433",
  );
  try {
    const result = await issueSupportGrant(db, { email, caseRef });
    await fileHandle.writeFile(JSON.stringify(result) + "\n");
    await fileHandle.sync();
    console.log(
      "One-use support authorization written privately. It expires in ten minutes; deliver through the separately verified channel.",
    );
  } catch (error) {
    await unlink(output).catch(() => {});
    throw error;
  } finally {
    await fileHandle.close();
    await db.close();
  }
}
