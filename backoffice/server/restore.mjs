import { restorePostgres } from "./postgres-backup.mjs";
process.umask(0o077);
if (!process.env.MIGRATION_DATABASE_URL || process.argv.length !== 4)
  throw new Error(
    "Provide an empty isolated MIGRATION_DATABASE_URL, backup directory and latest independent deletion journal",
  );
console.log(
  JSON.stringify(
    await restorePostgres({
      databaseUrl: process.env.MIGRATION_DATABASE_URL,
      backup: process.argv[2],
      journal: process.argv[3],
    }),
  ),
);
