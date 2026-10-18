// Recovery factors never contain plaintext codes, passwords or email tokens.
export const recoveryTables = `
CREATE TABLE IF NOT EXISTS recovery_codes(account_id text NOT NULL REFERENCES admins(id) ON DELETE CASCADE,hash text PRIMARY KEY,created bigint NOT NULL);
CREATE TABLE IF NOT EXISTS recovery_requests(id text PRIMARY KEY,account_id text NOT NULL REFERENCES admins(id) ON DELETE CASCADE,token_hash text NOT NULL UNIQUE,credential_tag text NOT NULL,status text NOT NULL CHECK(status IN ('sending','sent','failed','verified','used','revoked')),created bigint NOT NULL,expires bigint NOT NULL);
CREATE TABLE IF NOT EXISTS recovery_sessions(hash text PRIMARY KEY,request_id text NOT NULL REFERENCES recovery_requests(id) ON DELETE CASCADE,expires bigint NOT NULL,verified integer NOT NULL DEFAULT 0 CHECK(verified IN (0,1)),secret text NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS recovery_limits(bucket text PRIMARY KEY,attempts integer NOT NULL,reset_at bigint NOT NULL);
CREATE TABLE IF NOT EXISTS recovery_support(id text PRIMARY KEY,account_id text NOT NULL REFERENCES admins(id) ON DELETE CASCADE,code_hash text NOT NULL UNIQUE,expires bigint NOT NULL,case_ref text NOT NULL);
CREATE INDEX IF NOT EXISTS recovery_codes_account ON recovery_codes(account_id);
CREATE INDEX IF NOT EXISTS recovery_requests_account ON recovery_requests(account_id);
CREATE INDEX IF NOT EXISTS recovery_sessions_request ON recovery_sessions(request_id);
CREATE INDEX IF NOT EXISTS recovery_support_account ON recovery_support(account_id);
`;
export const recoveryUpgrade =
  recoveryTables +
  `
GRANT SELECT,INSERT,UPDATE,DELETE ON recovery_codes,recovery_requests,recovery_sessions,recovery_limits TO ai_control;
GRANT SELECT,DELETE ON recovery_support TO ai_control;
INSERT INTO schema_version VALUES(9);`;
