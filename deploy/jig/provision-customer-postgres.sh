#!/usr/bin/env bash
# One-time, jig-only provisioning. No app schema or live-data migration here.
set -euo pipefail
test "$(hostname)" = jig.123url.dk
test "$(id -u)" = 0
test ! -d /etc/postgresql/18/ai
test -z "$(command -v psql || true)"
backup=/root/123url-config-backups/ai-customer-postgres-initial
install -d -m 700 "$backup"
if test -f /etc/postgresql-common/createcluster.conf; then
  cp -a /etc/postgresql-common/createcluster.conf "$backup/createcluster.conf"
fi
install -d /etc/postgresql-common
printf 'create_main_cluster = false\n' > /etc/postgresql-common/createcluster.conf
DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l apt-get -y --no-install-recommends -o Dpkg::Options::=--force-confold install postgresql-18
test ! -d /etc/postgresql/18/main
id ai-migrate >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/ai-kundetype-migration --shell /usr/sbin/nologin ai-migrate
chmod 700 /var/lib/ai-kundetype-migration
pg_createcluster 18 ai --port=5433 --start-conf=manual -- --auth-local=peer --auth-host=reject
pg_conftool 18 ai set listen_addresses ''
pg_conftool 18 ai set unix_socket_directories /run/postgresql-ai
pg_conftool 18 ai set log_statement none
pg_conftool 18 ai set log_min_error_statement panic
pg_conftool 18 ai set log_parameter_max_length_on_error 0
pg_conftool 18 ai set log_parameter_max_length 0
pg_conftool 18 ai set log_error_verbosity terse
install -d -o postgres -g postgres -m 755 /run/postgresql-ai
printf 'd /run/postgresql-ai 0755 postgres postgres -\n' > /etc/tmpfiles.d/ai-postgresql.conf
cat > /etc/postgresql/18/ai/pg_hba.conf <<'CONF'
local all postgres peer
local ai_customer,ai_rehearsal,ai_restore ai_migrator peer map=ai_application
local ai_customer ai_control,ai_chat peer map=ai_application
local all all reject
CONF
cat > /etc/postgresql/18/ai/pg_ident.conf <<'CONF'
ai_application ai-kundetype ai_control
ai_application ai-kundetype ai_chat
ai_application ai-migrate ai_migrator
CONF
pg_ctlcluster 18 ai start
runuser -u postgres -- psql -h /run/postgresql-ai -p 5433 -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE ai_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE ai_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
GRANT ai_owner TO ai_migrator;
CREATE ROLE ai_control LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE ai_chat LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE DATABASE ai_customer OWNER ai_owner;
CREATE DATABASE ai_rehearsal OWNER ai_owner;
CREATE DATABASE ai_restore OWNER ai_owner;
REVOKE ALL ON DATABASE ai_customer FROM PUBLIC;
REVOKE ALL ON DATABASE ai_rehearsal FROM PUBLIC;
REVOKE ALL ON DATABASE ai_restore FROM PUBLIC;
GRANT CONNECT ON DATABASE ai_customer TO ai_control,ai_chat,ai_migrator;
GRANT CONNECT ON DATABASE ai_rehearsal,ai_restore TO ai_migrator;
SQL
systemctl enable postgresql@18-ai.service
pg_lsclusters
if ss -ltn | awk '{print $4}' | grep -Eq ':(5432|5433)$'; then
  echo 'Unexpected PostgreSQL TCP listener' >&2; exit 1
fi
