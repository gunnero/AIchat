# Automated backups and monitoring

This runbook covers the current Node 24.22 / PostgreSQL 18 / schema 8 application on jig. It supersedes historical SQLite backup instructions. Related work: [AK-049](https://github.com/gunnero/AIchat/issues/50), [AK-050](https://github.com/gunnero/AIchat/issues/51), [AK-055](https://github.com/gunnero/AIchat/issues/56).

See [verified release and deployment evidence](operations-deployment.md).

## Scope and responsibilities

The attached Hetzner volume is a separate disk on the same server. It is **not off-server disaster recovery**. Server loss, compromised root access or loss of that volume can still destroy the live data and its copies. Add an independently controlled encrypted off-server copy before declaring disaster recovery ready. Host-local monitoring also cannot notify if the whole server or network is down; add an independent external checker. Do not describe either acceptance item as completed.

The selected operational contact receives failure/recovery alerts at the address held in the root-only configuration. A labelled test alert on 18 October 2026 was accepted by iCloud, and its recipient confirmed receipt. Test fixtures never send mail. No OpenAI calls are part of these jobs. The contact triages incidents and arranges maintenance; this does not establish a staffed support SLA.

## Jobs and recovery targets

| Job | Schedule | What it does |
| --- | --- | --- |
| `ai-kundetype-backup.timer` | Hourly at :17, up to 60 seconds jitter | Consistent PostgreSQL custom-format dump, matching vault, deletion journal, checksum manifest; encrypt before durable storage. |
| `ai-kundetype-journal.timer` | Every 5 minutes | Independently encrypt the complete cumulative deletion journal. |
| `ai-kundetype-drill.timer` | Sunday 04:37 server time, up to 5 minutes jitter | Create synthetic accounts/chats, back up, encrypt/decrypt, restore to an empty isolated database and replay a later deletion. |
| `ai-kundetype-monitor.timer` | Every minute | Check service/public health, disks, backup volume identity, job freshness, latest archive existence/size, certificate expiry and aggregate HTTP error/rate-limit/latency counters. |

Targets while jobs and storage are healthy: database recovery point within approximately **one hour plus scheduling/runtime**, independent deletion-journal recovery point approximately **five minutes plus scheduling/runtime**. These are targets, not continuous replication or guaranteed maximum loss. If the latest journal is unavailable after a deletion, an older snapshot must stay offline until deletion requests can be reconciled. The live journal is preferred when it survives. Neither a fast synthetic drill nor a local disk copy proves whole-host recovery time. Initial target: restore service within **four hours** once a healthy destination, application release, keys and current recovery data are available; measure this with a full operator exercise before committing it commercially.

Full-backup retention keeps the newest 48 snapshots, one per day for the newest 14 represented days and one per ISO week for the newest 8 represented weeks. Journal retention keeps the newest 288 snapshots and one per day for 32 represented days. These sets overlap. The journal is cumulative, including older deletion tombstones, so replay it even against an older retained database snapshot. The policy is based on represented snapshots, not a guaranteed legal maximum age: if jobs stop, old copies remain instead of deleting the last recovery copy. Document legal retention separately. Historical manual cutover checkpoints are not pruned by this automation and require a separate retention review.

## Storage, keys and permissions

- Repository: `/mnt/HC_Volume_106669788/ai-kundetypeassistent-backups`, root-owned 0700; archives/receipts 0600. Only this dedicated folder is managed. Other files on the volume are untouched.
- The configured filesystem UUID and exact mountpoint must match before any directory creation/write. Missing mounts never fall back to the underlying system disk. Backups stop below 10 GiB free or at 90% usage; monitoring warns at 85% or below 10 GiB.
- Encrypted archives use age's authenticated public-key encryption. Only the public recipient is on jig. The recovery identity was generated in a private file on the operator's Mac and must be retained in a separately secured recovery location. Do not put it on jig, the volume, GitHub, email or in chat. Loss of the identity makes the encrypted copies unrecoverable. Confirm custody and a second safe copy during handover.
- Plaintext staging, including the vault, stays in per-job 0700 directories beneath `/run/ai-kundetype-operations` (tmpfs) and is removed after each job. The server's live vault remains in private application state. A key change during a dump aborts publication.
- A dedicated non-login OS identity `ai-backup` uses local peer authentication as `ai_backup`. This operator-only database role bypasses row policies to read the full backup, but has SELECT privileges only, no owner membership, no DDL/write privileges and no password/TCP route. The application OS account cannot connect as it. Application roles retain forced row policies and cannot become owner/backup roles.
- Config: `/etc/ai-kundetypeassistent/operations.json`, root-only 0600. State: `/var/lib/ai-kundetype-operations`, root-only 0700. Code: `/opt/ai-kundetype-operations/current`, root-owned/read-only. No new public metrics API or administration access to private chats is introduced.
- The root orchestrator asks systemd to start each fixed non-login worker identity directly. Each transient worker has an empty capability set, no privilege gains, a read-only system and only its individual private `/run` working directory writable. No in-process UID switching is used inside the sandbox; the orchestrator has only the file ownership/read capabilities needed to stage and encrypt recovery data.

Archive receipts expose only ciphertext filename, size, creation time and SHA-256. Numeric HTTP telemetry contains no paths, queries, bodies, titles, identities, headers, credentials or MFA values. It rolls over a 15-minute in-memory window; only the latest aggregate is written to private `metrics.json` every 30 seconds. p50/p95 are histogram upper bounds for completed **server HTTP requests**, not browser performance, model response speed or time to readable AI text. No AI is enabled yet.

## Alerts and triage

Two consecutive identical failing observations trigger one email; unresolved problems repeat every six hours. Two healthy checks produce a recovery email. A local SMTP acceptance is recorded separately from recipient delivery; a failed submission is retried on subsequent checks. The first real test had confirmed inbox delivery. Alerts use the existing local STARTTLS mail setup and contain check names and timestamps only.

Thresholds: stale full backup 90 minutes, journal 15 minutes, drill 8 days, metrics 3 minutes; certificate validity under 14 days; over 5% server errors with at least 20 requests; over 20% HTTP 429 responses with at least 50 requests; p95 server request bucket at least 5 seconds with at least 20 requests. Service checks include the scoped application, PostgreSQL cluster and Apache. Public and loopback health use the expected application identity over trusted HTTPS/loopback. Aggregate 429 counters include ordinary API throttling; diagnosing sign-in incidents still requires content-free investigation.

As an authorized operator over the existing pinned jig SSH route:

```sh
systemctl list-timers --all 'ai-kundetype-*'
systemctl status ai-kundetype-job@backup ai-kundetype-job@journal ai-kundetype-job@drill ai-kundetype-job@monitor
journalctl -u 'ai-kundetype-job@*' --since '1 hour ago' --no-pager
cat /var/lib/ai-kundetype-operations/monitor.json
```

These status files are operational metadata only. Do not dump application environment, vault, database rows or SMTP message bodies into logs or tickets. For a volume/capacity alert verify UUID, free space and other disk owners before any cleanup; never delete unrelated volume data. For a stale backup inspect its safe failure code, restore capacity/access, run the scoped job and verify the new encrypted archive/receipt. For a service failure inspect health and safe service warnings, then repair only the affected application. For certificate warnings verify the existing renewal service instead of replacing TLS configuration. If alert mail is not accepted, investigate the local MTA and outbound SMTP; it is not an independent notification channel.

## Restore procedure

1. Keep traffic disabled for a recovery. Preserve the current database and latest live vault/journal, including any writes newer than the selected snapshot. Code rollback must never rewind the database or reopen retired SQLite state. Resolve data-loss/reconciliation decisions before substituting older data.
2. Select a verified database archive and the **newest surviving cumulative independent deletion journal** (including the current live journal if available). Verify receipt SHA-256 against each encrypted archive. An older journal is not adequate simply because the dump's internal checksum passes. Restrict all recovery directories to 0700 and files to 0600.
3. On an approved isolated recovery host, use the separately held age identity to decrypt each archive to a private directory. Pass the identity by private file path; never paste its contents or put them in process arguments. List archive members before extraction: database archives contain exactly `database.dump`, `vault.key`, `deletions.jsonl`, `manifest.json`; journal archives contain only `deletions.jsonl`. Refuse extra members, paths or links. Extract only into a newly created private directory. Keep plaintext off web roots, developer/staging environments and durable unencrypted storage. Remove recovery staging after successful secure handover.
4. Provision PostgreSQL 18 roles/peer authentication and an **empty isolated target database** under `ai_owner`, using the reviewed production-role setup, never CI passwords. The automatic drill uses only the marked `ai_ops_probe`/`ai_ops_restore` databases and must never be repointed at customer data. A real recovery requires a separately reviewed target and operator route.
5. Run the reviewed application helper as the maintenance operator:

   ```sh
   MIGRATION_DATABASE_URL='<approved isolated operator connection>' \
     node server/restore.mjs /private/recovery/database /private/recovery/latest/deletions.jsonl
   ```

   It verifies the inner checksums, requires an empty target, restores schema/data, merges the DB deletion ledger with both journals, deletes tombstoned conversations/messages and revokes all old login/setup/registration sessions. It writes the merged journal as `deletions.jsonl.replayed`. Failure at any step keeps recovery offline.
6. Verify the matching vault, required schema/release compatibility, enrolled MFA, protected Admin rules, counts and deletion replay through approved operator checks without exposing private content. Install the archive's matching vault and the generated merged journal with runtime ownership/0600 permissions. Recreate the scoped service/private environment from the operator configuration checkpoint and reviewed deployment documentation. The database archive is not an image of all OS, Apache, mail or server configuration.
7. Switch only the scoped application connection/release, preserving post-snapshot writes or applying the agreed reconciliation. Validate private role permissions, HTTPS health, sign-in and fresh backups before restoring traffic. Never automatically replace live PostgreSQL with a drill database or a stale snapshot.

The weekly automated drill uses **synthetic records only**: encrypted titles/messages, a protected Admin, a real password hash/MFA secret and a session. It deletes a conversation after backup, independently encrypts the later journal, then verifies both that conversation and its messages stay absent, the surviving content decrypts, password/MFA and owner protection survive, and sessions are revoked. Both marked databases are reset afterward. This validates the pipeline without granting the backup/monitor service private-chat UI access or copying production customer data to tests.

## Installation, updates and rollback

Review/push the exact commit and require all matching CI checks before deployment. First take a fresh private PostgreSQL/vault/journal checkpoint. Deploy the compatible application release; no schema change is required for telemetry. Run `deploy/jig/install-operations.sh` from a root-owned checksum-verified bundle with a root-only real configuration. It refuses pre-existing unmarked drill databases, backup identities or repositories rather than adopting them. It snapshots only scoped authentication/configuration files outside active config paths, adds the read-only backup role/peer mapping, validates application-role exclusion, installs the private jobs and verifies initial encrypted snapshots plus the synthetic restore before enabling timers.

For code recovery, switch only to compatible code and restart the scoped app; preserve PostgreSQL writes. To stop operational scheduling, disable the four `ai-kundetype-*.timer` units, stop only their running job instances, and preserve encrypted archives, the recovery identity and current deletion records. An in-flight cancelled job may leave a `.partial` file or private `/run` staging directory; remove only verified inactive job artifacts after checking active workers. Don't remove the disk mount, live state or database role as an automatic rollback. Review the scoped checkpoint before reverting HBA/ident rules; validate and reload the dedicated cluster without broad restarts. Existing application connections/privileges and unrelated vhosts are never intentionally changed.

Remaining handover items: independent off-server encrypted copies and recovery exercise, external whole-host outage notification, recovery-key custody, legal retention/deletion reconciliation, measured full-dataset recovery time, privacy incident ownership and customer support arrangements. Live AI streaming/usage/spend monitoring belongs to its later runtime release.
