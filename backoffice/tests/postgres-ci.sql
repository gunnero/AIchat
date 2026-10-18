-- Disposable CI databases only. Never use these fixture passwords on a host.
CREATE ROLE ai_owner NOLOGIN;
CREATE ROLE ai_migrator LOGIN BYPASSRLS PASSWORD 'synthetic-ci-only';
GRANT ai_owner TO ai_migrator;
CREATE ROLE ai_control LOGIN PASSWORD 'synthetic-ci-only';
CREATE ROLE ai_chat LOGIN PASSWORD 'synthetic-ci-only';
CREATE DATABASE ai_customer OWNER ai_owner;
CREATE DATABASE ai_restore OWNER ai_owner;
