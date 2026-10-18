-- Operator-only, additive privileges. Neither application role is changed.
-- Run in postgres, then ai_customer, as specified in the installation runbook.
SELECT 'CREATE ROLE ai_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='ai_backup')\gexec
GRANT CONNECT ON DATABASE ai_customer TO ai_backup;

\connect ai_customer
GRANT USAGE ON SCHEMA public,private TO ai_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA public,private TO ai_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public,private TO ai_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE ai_owner IN SCHEMA public,private GRANT SELECT ON TABLES TO ai_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE ai_owner IN SCHEMA public,private GRANT SELECT ON SEQUENCES TO ai_backup;

\connect postgres
SELECT 'CREATE DATABASE ai_ops_probe OWNER ai_owner'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='ai_ops_probe')\gexec
SELECT 'CREATE DATABASE ai_ops_restore OWNER ai_owner'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='ai_ops_restore')\gexec
-- The installer must reject pre-existing unmarked databases before this script.
COMMENT ON DATABASE ai_ops_probe IS 'AI OPERATIONS SYNTHETIC ONLY';
COMMENT ON DATABASE ai_ops_restore IS 'AI OPERATIONS SYNTHETIC ONLY';
REVOKE ALL ON DATABASE ai_ops_probe,ai_ops_restore FROM PUBLIC;
GRANT CONNECT ON DATABASE ai_ops_probe,ai_ops_restore TO ai_migrator;
