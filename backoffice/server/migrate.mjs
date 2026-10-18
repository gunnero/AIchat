import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { openPostgres } from "./postgres.mjs";

const tables = [
  "customers",
  "admins",
  "connections",
  "projects",
  "prompt_versions",
  "assignments",
  "audit",
  "owner_identity",
  "invitations",
  "login_failures",
];
export async function migrate(db, sqlitePath) {
  let source;
  if (sqlitePath) {
    source = new DatabaseSync(sqlitePath, { readOnly: true });
    if (
      source.prepare("PRAGMA integrity_check").get().integrity_check !== "ok" ||
      source.prepare("PRAGMA foreign_key_check").all().length
    )
      throw new Error("SQLite integrity verification failed");
    if (
      source.prepare("SELECT max(version) AS v FROM schema_version").get().v !==
      2
    )
      throw new Error("Expected SQLite schema 2");
  }
  try {
    return await db.transaction(async () => {
      await db.query("SET LOCAL ROLE ai_owner");
      const exists = (
        await db.query("SELECT to_regclass('public.schema_version') AS name")
      ).rows[0].name;
      if (exists) {
        if (source)
          throw new Error(
            "SQLite import requires an empty target database; existing data was preserved",
          );
        if (
          (await db.query("SELECT max(version) AS v FROM schema_version"))
            .rows[0].v !== 3
        )
          throw new Error("Unsupported schema");
        return { schema: 3, imported: false };
      }
      await db.query(
        await readFile(new URL("./schema.sql", import.meta.url), "utf8"),
      );
      let records = 0;
      if (source)
        for (const table of tables) {
          const rows = source.prepare(`SELECT * FROM ${table}`).all();
          const keys = Object.keys(rows[0] || {});
          for (const row of rows)
            await db.query(
              `INSERT INTO ${table}(${keys.join(",")}) VALUES(${keys.map((_, i) => "$" + (i + 1)).join(",")})`,
              keys.map((k) => row[k]),
            );
          const actual = (await db.query(`SELECT * FROM ${table}`)).rows;
          // Compare a deterministic column/row ordering, never emit private records.
          const normalize = (data) =>
            data
              .map((r) =>
                JSON.stringify(
                  Object.fromEntries(
                    Object.entries(r).sort(([a], [b]) => a.localeCompare(b)),
                  ),
                ),
              )
              .sort();
          if (
            JSON.stringify(normalize(rows)) !==
            JSON.stringify(normalize(actual))
          )
            throw new Error("Migration verification failed: " + table);
          records += rows.length;
        }
      // Session and in-progress setup/registration cookies are intentionally
      // invalidated once; enrolled credentials and pending invitations survive.
      return { schema: 3, imported: !!source, records };
    });
  } finally {
    source?.close();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (!process.env.MIGRATION_DATABASE_URL)
    throw new Error("MIGRATION_DATABASE_URL is required");
  const db = openPostgres(process.env.MIGRATION_DATABASE_URL);
  try {
    console.log(JSON.stringify(await migrate(db, process.argv[2])));
  } finally {
    await db.close();
  }
}
