#!/usr/bin/env bash
# Called from a verified, root-owned deployment bundle on jig only.
set -euo pipefail
umask 077
test "$(hostname)" = jig.123url.dk
test "$(id -u)" = 0
test "$#" = 2
ops_bundle=$(realpath "$1")
ops_revision=$2
[[ "$ops_revision" =~ ^[a-f0-9]{40}$ ]]
test -f "$ops_bundle/operations.json"
test -f "$ops_bundle/provision-operations.sql"
test "$(readlink /opt/ai-kundetypeassistent/current)" = "releases/$ops_revision"
ops_checkpoint=/root/123url-config-backups/ai-operations-$ops_revision
test ! -e "$ops_checkpoint"
install -d -m 700 "$ops_checkpoint"
cp -a /etc/postgresql/18/ai/pg_hba.conf /etc/postgresql/18/ai/pg_ident.conf "$ops_checkpoint/"
if test -d /etc/ai-kundetypeassistent; then cp -a /etc/ai-kundetypeassistent "$ops_checkpoint/config"; fi
systemctl list-timers --all --no-pager > "$ops_checkpoint/timers-before.txt"
runuser -u postgres -- psql -h /run/postgresql-ai -p 5433 -d postgres -X -At -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_database WHERE datname IN ('ai_ops_probe','ai_ops_restore') AND coalesce(shobj_description(oid,'pg_database'),'')<>'AI OPERATIONS SYNTHETIC ONLY')
 THEN RAISE EXCEPTION 'An unmarked drill database already exists'; END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='ai_backup')
 THEN RAISE EXCEPTION 'Backup role already exists; review instead of overwriting'; END IF;
END $$;
SQL
if id ai-backup >/dev/null 2>&1; then echo 'Backup OS identity already exists; review before provisioning.' >&2; exit 1; fi
useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin ai-backup
runuser -u postgres -- psql -h /run/postgresql-ai -p 5433 -d postgres -X -v ON_ERROR_STOP=1 < "$ops_bundle/provision-operations.sql"
python3 - "$ops_checkpoint" <<'PY'
from pathlib import Path
hba=Path('/etc/postgresql/18/ai/pg_hba.conf')
text=hba.read_text()
new='local ai_customer ai_backup peer map=ai_application\nlocal ai_ops_probe,ai_ops_restore ai_migrator peer map=ai_application\n'
assert text.count('local all all reject')==1
hba.write_text(text.replace('local all all reject',new+'local all all reject'))
ident=Path('/etc/postgresql/18/ai/pg_ident.conf')
ident.write_text(ident.read_text()+'ai_application ai-backup ai_backup\n')
PY
runuser -u postgres -- psql -h /run/postgresql-ai -p 5433 -d postgres -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN IF EXISTS(SELECT FROM pg_hba_file_rules WHERE error IS NOT NULL) THEN RAISE EXCEPTION 'Invalid HBA rule'; END IF; END $$;
SELECT pg_reload_conf();
SQL
runuser -u ai-backup -- psql -h /run/postgresql-ai -p 5433 -U ai_backup -d ai_customer -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF current_user<>'ai_backup' OR pg_has_role(current_user,'ai_owner','MEMBER')
 OR NOT has_table_privilege('admins','SELECT') OR has_table_privilege('admins','UPDATE')
 OR has_table_privilege('private.conversations','DELETE')
 THEN RAISE EXCEPTION 'Unsafe backup role'; END IF;
END $$;
SELECT 1;
SQL
if runuser -u ai-kundetype -- psql -h /run/postgresql-ai -p 5433 -U ai_backup -d ai_customer -X -c 'SELECT 1' >/dev/null 2>&1; then
 echo 'Application OS account unexpectedly reached backup role.' >&2; exit 1
fi
ops_release=/opt/ai-kundetype-operations/releases/$ops_revision
install -d -m 755 "$ops_release" /etc/ai-kundetypeassistent
install -m 644 "$ops_bundle/operations.py" "$ops_release/operations.py"
install -m 600 "$ops_bundle/operations.json" /etc/ai-kundetypeassistent/operations.json
python3 - <<'PY'
import json
from pathlib import Path
source=Path('/etc/ai-kundetypeassistent/operations.json')
config=json.loads(source.read_text())
# Mount identity and filesystem capacity must be checked before mkdir.
import subprocess,shutil,os
info=json.loads(subprocess.check_output(['findmnt','--json','--target',config['mount'],'--output','TARGET,UUID']))['filesystems'][0]
assert info['target']==config['mount'] and info['uuid']==config['mountUuid']
assert shutil.disk_usage(config['mount']).free > 10*1024**3
repository=Path(config['repository'])
assert repository.parent==Path(config['mount']) and repository.name=='ai-kundetypeassistent-backups'
assert not repository.exists()
repository.mkdir(mode=0o700)
PY
ln -s "releases/$ops_revision" /opt/ai-kundetype-operations/current.next
mv -Tf /opt/ai-kundetype-operations/current.next /opt/ai-kundetype-operations/current
for ops_unit in "$ops_bundle"/*.service "$ops_bundle"/*.timer; do
 install -m 644 "$ops_unit" /etc/systemd/system/
done
systemd-analyze verify /etc/systemd/system/ai-kundetype-job@.service /etc/systemd/system/ai-kundetype-*.timer
systemctl daemon-reload
# Run and verify the first snapshots/drill before enabling monitor notifications.
systemctl start ai-kundetype-job@backup.service ai-kundetype-job@journal.service
systemctl start ai-kundetype-job@drill.service
python3 - <<'PY'
from pathlib import Path
import json
for kind in ['backup','journal','drill']:
 state=json.loads((Path('/var/lib/ai-kundetype-operations')/(kind+'.json')).read_text())
 assert state['success'] is True, (kind,state.get('failure'))
print('First encrypted database/journal backups and synthetic recovery drill passed.')
PY
systemctl start ai-kundetype-job@monitor.service
systemctl enable --now ai-kundetype-backup.timer ai-kundetype-journal.timer ai-kundetype-drill.timer ai-kundetype-monitor.timer
systemctl list-timers --all --no-pager | grep ai-kundetype
echo 'Scoped operational jobs installed. Runtime app roles and public routing are unchanged.'
