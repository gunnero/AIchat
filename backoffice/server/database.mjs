import { DatabaseSync } from "node:sqlite";
export function openDatabase(path) {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY);
    INSERT OR IGNORE INTO schema_version VALUES(1);
    CREATE TABLE IF NOT EXISTS admins(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE COLLATE NOCASE,name TEXT NOT NULL,password_hash TEXT NOT NULL,mfa_secret TEXT NOT NULL,last_step INTEGER NOT NULL DEFAULT -1,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,admin_id TEXT NOT NULL REFERENCES admins(id),created INTEGER NOT NULL,seen INTEGER NOT NULL,expires INTEGER NOT NULL,mfa_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS setup_sessions(hash TEXT PRIMARY KEY,secret TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS login_failures(bucket TEXT PRIMARY KEY,failures INTEGER NOT NULL,reset_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS customers(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE COLLATE NOCASE,status TEXT NOT NULL CHECK(status IN ('pending','active','paused')),expires TEXT,allowance INTEGER NOT NULL CHECK(allowance>=0),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS connections(id TEXT PRIMARY KEY,label TEXT NOT NULL,project_ref TEXT NOT NULL,environment TEXT NOT NULL CHECK(environment IN ('test','production')),key_secret TEXT NOT NULL,suffix TEXT NOT NULL,revision INTEGER NOT NULL,enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),status TEXT NOT NULL,last_checked TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE COLLATE NOCASE,description TEXT NOT NULL,connection_id TEXT REFERENCES connections(id),enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS prompt_versions(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),prompt_id TEXT NOT NULL,name TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),instructions TEXT NOT NULL,source_ref TEXT NOT NULL,checksum TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(project_id,prompt_id,version),UNIQUE(project_id,id));
    CREATE TABLE IF NOT EXISTS assignments(customer_id TEXT NOT NULL REFERENCES customers(id),project_id TEXT NOT NULL REFERENCES projects(id),version_id TEXT NOT NULL,PRIMARY KEY(customer_id,project_id),FOREIGN KEY(project_id,version_id) REFERENCES prompt_versions(project_id,id));
    CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,admin_id TEXT REFERENCES admins(id),action TEXT NOT NULL,target TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires);
  `);
  const version = db
    .prepare("SELECT max(version) AS version FROM schema_version")
    .get().version;
  if (version !== 1) {
    db.close();
    throw new Error("Unsupported database schema");
  }
  return db;
}
export function transaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
