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
  if (version === 1) {
    transaction(db, () => {
      db.exec(`
        ALTER TABLE admins ADD COLUMN username TEXT COLLATE NOCASE;
        ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT 'admin' CHECK(role IN ('admin','customer'));
        ALTER TABLE admins ADD COLUMN protected INTEGER NOT NULL DEFAULT 0 CHECK(protected IN (0,1));
        ALTER TABLE admins ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('pending','active','paused'));
        ALTER TABLE admins ADD COLUMN locale TEXT NOT NULL DEFAULT 'da' CHECK(locale IN ('en','da'));
        ALTER TABLE admins ADD COLUMN customer_id TEXT REFERENCES customers(id);
        CREATE UNIQUE INDEX account_username ON admins(username) WHERE username IS NOT NULL;
        CREATE UNIQUE INDEX account_customer ON admins(customer_id) WHERE customer_id IS NOT NULL;
        UPDATE admins SET protected=1 WHERE id=(SELECT id FROM admins ORDER BY created_at,id LIMIT 1);
        CREATE UNIQUE INDEX single_protected_account ON admins(protected) WHERE protected=1;
        CREATE TABLE owner_identity(singleton INTEGER PRIMARY KEY CHECK(singleton=1),name TEXT NOT NULL,email TEXT NOT NULL,username TEXT NOT NULL);
        CREATE TABLE invitations(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES admins(id),token_hash TEXT NOT NULL UNIQUE,expires INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN ('sending','sent','failed','revoked','used')),created_at TEXT NOT NULL);
        CREATE INDEX invitation_account ON invitations(account_id);
        CREATE TABLE registrations(hash TEXT PRIMARY KEY,invitation_id TEXT NOT NULL REFERENCES invitations(id),secret TEXT NOT NULL,expires INTEGER NOT NULL);
        CREATE TRIGGER protect_owner_delete BEFORE DELETE ON admins WHEN OLD.protected=1 BEGIN SELECT RAISE(ABORT,'Account cannot be changed'); END;
        CREATE TRIGGER protect_owner_identity BEFORE UPDATE OF email,name,username,role,protected,status,customer_id ON admins
          WHEN OLD.protected=1 AND (NEW.email IS NOT OLD.email OR NEW.name IS NOT OLD.name OR NEW.username IS NOT OLD.username OR NEW.role IS NOT OLD.role OR NEW.protected IS NOT OLD.protected OR NEW.status IS NOT OLD.status OR NEW.customer_id IS NOT OLD.customer_id)
          BEGIN SELECT RAISE(ABORT,'Account cannot be changed'); END;
        INSERT INTO schema_version VALUES(2);
      `);
    });
  } else if (version !== 2) {
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
