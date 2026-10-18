> Historical initial-cutover record. Current production uses PostgreSQL 18/schema 8 and the later workspace releases. Follow [current operations](operations.md) for scheduled backups, monitoring and recovery. Outbound operational email was delivered and confirmed on 18 October; invitation end-to-end testing remains separate.

# Customer workspace deployment — 18 October 2026

The real application is live at [ai.igurl.dk](https://ai.igurl.dk/), administration at [/backoffice/](https://ai.igurl.dk/backoffice/) and the synthetic demonstration at [/demo/](https://ai.igurl.dk/demo/). AI replies and sharing remain disabled in the real workspace. Invitation delivery is still waiting for Hetzner's SMTP unblock.

## Execution and release

- Execution machine: Aleksandar's developer Mac, user `aleksandardimovski`; verified existing Mac → `web01` SSH relay → `jig.123url.dk` (`46.224.27.137`). Root performed scoped PostgreSQL/systemd/Apache work; dependency preparation and demo extraction ran as `igurl`; migration/backup/restore ran as non-login `ai-migrate`.
- Runtime: `ai-backoffice.service`, non-login `ai-kundetype`, Node 24.22, listener only `127.0.0.1:8765`. Current code `/opt/ai-kundetypeassistent/current` → `releases/0eee8de7cb4d778d42caebdcce9c2296f9c023ac`. Release files are root-owned and read-only to the runtime. [Draft PR #72](https://github.com/gunnero/AIchat/pull/72) is stacked on #70; nothing was merged.
- PostgreSQL: dedicated `18/ai` cluster, version 18.6, schema 3, socket `/run/postgresql-ai`, port 5433 with **no TCP listener**. Runtime roles `ai_control`/`ai_chat` are neither superusers nor RLS bypass roles and cannot become `ai_owner`. The application OS account was verified unable to connect as `ai_migrator`.
- Demo: `/home/igurl/domains/ai.igurl.dk/demo_current` → `releases/0eee8de7cb4d778d42caebdcce9c2296f9c023ac-demo`, owned by `igurl`. Its assets use `/demo/`; the original Sites build and production guard remain intact.
- Customer archive SHA-256: `e589050bc1c0460ff028fccf49af8bf6a97905dbbf7979f32e04c14b72fa0050` (67 packaged files). Demo archive SHA-256: `0a2658d80cbc0bc553ac09d3ad82db87628aee20c8ed3664a3ca03e4e4519d4a` (13 files). Source/build manifests were checked on jig; all **58 publicly served build/metadata hashes** matched over trusted HTTPS.

## Migration and recovery evidence

The initial customer cutover used `7ece804400fb0587afdd847a447f77a304a3b6f6` after all four CI checks passed. PostgreSQL installation added five packages without upgrading existing packages. It did not create a default/main cluster or open a network database port.

Before activation, the live SQLite schema-2/vault snapshot was imported into separate `ai_rehearsal`; every imported record matched. A real PostgreSQL dump/restore into `ai_restore` succeeded, applied the independent deletion journal and preserved the matching vault. The app continued using SQLite during this rehearsal. After stopping the app, a second final snapshot was imported into empty `ai_customer`. Session/setup/registration cookies were invalidated once. The owner reservation was preserved; there were no enrolled accounts or customer chats at cutover, and no fixtures were deployed. The owner still needs to complete private password/TOTP enrollment.

Checkpoints:

- Original configuration/unit/environment and unrelated vhost hashes: `/root/123url-config-backups/ai-customer-workspace-7ece804400fb0587afdd847a447f77a304a3b6f6`.
- Final consistent SQLite/vault checkpoint: `/var/lib/ai-kundetypeassistent/backups/workspace-final-7ece804400fb0587afdd847a447f77a304a3b6f6`.
- Rehearsed PostgreSQL backup: `/var/lib/ai-kundetype-migration/7ece804400fb0587afdd847a447f77a304a3b6f6/postgres-backup`.
- First production PostgreSQL/vault/journal backup: `/var/lib/ai-kundetype-migration/7ece804400fb0587afdd847a447f77a304a3b6f6/production-first-backup`.
- Fresh PostgreSQL checkpoint before the session follow-up: `/var/lib/ai-kundetype-migration/0eee8de7cb4d778d42caebdcce9c2296f9c023ac/before-session-update`.

The session follow-up changed code only, with an identical schema; it restricted the HTTPS cookie to `__Host-ai_session` and prevented passive project polling from extending inactivity. It preserved PostgreSQL records and needed no migration or Apache reload. The retired SQLite source is root-owned/mode 000 so an accidental old runtime fails rather than resumes a stale database. **Never rewind customer writes to a SQLite checkpoint.**

For operator backups, root first copies the current matching vault and independent journal into a new 0700 directory owned by `ai-migrate`, using mode 0600 files. Run the PostgreSQL backup there as `ai-migrate`; that account intentionally cannot read the application's private state directory directly. Restore offline to an empty database, replay the latest independent journal, and install the generated `.replayed` merged journal with the matching vault before enabling traffic. See the [current recovery procedure](customer-workspace.md). Offsite backup automation, retention/monitoring and full release privacy work remain separate.

## Verification

All four checks on the deployed application commit passed: [backend push](https://github.com/gunnero/AIchat/actions/runs/39139725416), [backend PR](https://github.com/gunnero/AIchat/actions/runs/39139728577), [app push](https://github.com/gunnero/AIchat/actions/runs/39139725465), [app PR](https://github.com/gunnero/AIchat/actions/runs/39139728707). They cover **44 backend/catalog cases** (12 PostgreSQL cases), **3 customer interaction cases**, **25 demo cases**, **4 worker cases**, builds and zero runtime audit advisories.

Verified real PostgreSQL isolation, encryption, ordering/retries, assignment changes/revocation, password/MFA preservation, invitations through PostgreSQL, protected-owner triggers, real dump/restore after a later deletion, pool context cleanup and idle expiry during passive polling. Synthetic browser review covered password/TOTP login, save → refresh → reopen, English/Danish and desktop/mobile. No real email was sent and OpenAI was not called.

Trusted HTTPS returned 200 for root/backoffice/demo and the expected health revision; unauthenticated project/session requests returned 401, public setup 403, private source/vault paths 404. The live host-only cookie's Secure, HttpOnly, Strict and root Path attributes were checked. A synthetic search canary was absent from Apache's access log. Private tables have forced row policies; `ai_control` has no private-message SELECT privilege. Service warning logs were empty. All unrelated vhost hashes matched; DNS, TLS certificates, mail configuration and other sites were unchanged. Apache configuration validation preceded the scoped graceful reload.
