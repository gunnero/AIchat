// Operator-only, no passwords or MFA material. Reservation cannot replace an
// enrolled account. Run as the service user against its private state directory.
import { resolve } from "node:path";
import { z } from "zod";
import { openDatabase, transaction } from "./database.mjs";
import { username } from "./accounts.mjs";
const [name, email, handle] = process.argv.slice(2);
const v = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.email().transform((s) => s.toLowerCase()),
    username,
  })
  .parse({ name, email, username: handle });
const db = openDatabase(
  resolve(process.env.STATE_DIR || ".state", "backoffice.sqlite"),
);
try {
  transaction(db, () => {
    if (db.prepare("SELECT id FROM admins LIMIT 1").get())
      throw new Error("Owner already enrolled; reservation is closed");
    db.prepare(
      "INSERT INTO owner_identity VALUES(1,?,?,?) ON CONFLICT(singleton) DO UPDATE SET name=excluded.name,email=excluded.email,username=excluded.username",
    ).run(v.name, v.email, v.username);
    db.prepare("DELETE FROM setup_sessions").run();
  });
  console.log(
    "Owner identity reserved. Password and authenticator enrollment remain required.",
  );
} finally {
  db.close();
}
