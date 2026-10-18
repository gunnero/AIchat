import pg from "pg";
import { AsyncLocalStorage } from "node:async_hooks";

// The SQLite adapter is retained for legacy migration/behavior fixtures only.
// Production never falls back to it when PostgreSQL is unavailable.
pg.types.setTypeParser(20, (value) => Number(value));
const LOCK = 804123;
export function openPostgres(connectionString, { max = 8 } = {}) {
  const pool = new pg.Pool({
    connectionString,
    max,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 10000,
    idle_in_transaction_session_timeout: 15000,
  });
  pool.on("error", () => {
    /* fail the affected request without logging bindings */
  });
  const scope = new AsyncLocalStorage();
  const db = {
    dialect: "postgres",
    pool,
    async query(sql, values = []) {
      return (scope.getStore() || pool).query(sql, values);
    },
    prepare(sql) {
      let parameter = 0;
      const text = sql
        .replace(/\?/g, () => "$" + ++parameter)
        .replace(/\s+COLLATE NOCASE/g, "")
        .replace(/ORDER BY rowid DESC/g, "ORDER BY created_at DESC,id DESC")
        // pg folds unquoted aliases; keep the existing public DTO spelling.
        .replace(/AS (projectId|versionId)\b/g, 'AS "$1"');
      return {
        async get(...values) {
          return (await db.query(text, values)).rows[0];
        },
        async all(...values) {
          return (await db.query(text, values)).rows;
        },
        async run(...values) {
          return { changes: (await db.query(text, values)).rowCount };
        },
      };
    },
    async transaction(fn, { sessionHash, shared = false } = {}) {
      if (scope.getStore()) return fn();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Account/assignment edits and chat operations serialize at the policy
        // boundary. No provider/network calls are made inside this transaction.
        await client.query(
          `SELECT pg_advisory_xact_lock${shared ? "_shared" : ""}($1)`,
          [LOCK],
        );
        if (sessionHash)
          await client.query("SELECT set_config('app.session_hash',$1,true)", [
            sessionHash,
          ]);
        const result = await scope.run(client, fn);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
  return db;
}
