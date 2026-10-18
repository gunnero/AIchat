# Persistent administrator backoffice

18 October 2026. The administrator application in `backoffice/` is a separate service from the synthetic customer demo in `app/`. The approved monochrome design is retained. No existing demo fixtures are migrated into the real database.

Deployed at [https://ai.igurl.dk/backoffice/](https://ai.igurl.dk/backoffice/) with first-owner enrollment handed to the owner through the private setup bridge. The account update reserves the requested identity before enrollment; it does not install a password from chat. See [verified deployment and rollback](deployment-jig.md#administrator-service-deployment--18-october-2026). The runtime starts with no administrator or example customers/keys. Projects and prompt versions can be prepared before adding the first API connection; once a configured project has versions, its existing connection is preserved.

## This release

- Password plus TOTP authenticator sign-in; hashed, revocable server sessions, inactivity and absolute expiry, origin/CSRF checks, persistent failed-login limits and fresh MFA for credential changes.
- First-owner enrollment through loopback only, before any owner exists, requiring a separate server-held bootstrap secret injected by the authorized operator's private bridge. Proxy headers and public setup requests are rejected. There is no default account/password.
- Persistent customer metadata, active/paused/pending states, account expiry and an allowance setting. Creating a customer also creates a pending Customer identity and sends a personal invitation. Activation requires the recipient to choose a username/password and enroll TOTP.
- Multiple projects per customer, each assigned an exact prompt version through composite foreign keys. Failed assignment changes roll back atomically.
- Project-specific OpenAI connections, encrypted write-only API keys, masked last-four-character metadata, connection checks, pause and tested replacement. Failed replacement preserves the existing key; stale/in-flight work cannot overwrite a newer revision or commit after logout.
- Manual entry/import of approved prompt instructions into immutable encrypted versions. The catalogue returns metadata; viewing instructions requires an authenticated administrator. New versions do not change existing customer assignments.
- An administrative activity log containing actions and record IDs, without keys, passwords, private instructions or customer chat bodies.
- Consistent SQLite backup plus its matching vault key, with a synthetic restore/integrity/decryption test.

The OpenAI probe calls only `GET https://api.openai.com/v1/models` with the supplied project header. It verifies that permission, not generation availability, credit balance, geographic processing or access to a prompt library. Provider error bodies are never returned or logged. The automated tests inject a fake provider; no credentials supplied in chat have been copied, stored or used.

Current official [prompting guidance](https://developers.openai.com/api/docs/guides/prompting) and [migration guide](https://developers.openai.com/api/docs/guides/prompting/migrate-from-prompt-object) recommend application-owned instructions. A supported saved-prompt enumeration/retrieval interface with these project keys has not been verified. Do not label manual instruction entry as automatic synchronization or implement an undocumented dashboard endpoint.

## Deliberate boundary

This is the first real **administrator service**, not the customer launch. Private conversation persistence, the generation gateway, actual allowance accounting/payments, knowledge retrieval/evaluations, supplier/legal decisions and release security review remain tracked separately. Administrators have no chat endpoint or private conversation database in this service.

Admin/Customer identity, staff invitation and protected-owner rules are implemented. Fully rehearsed recovery remains a follow-up. Public registration accepts only a live, server-issued invitation and cannot choose its account, email or role. Keep authenticator enrollment material in the owner's approved password manager. Password changes require the current password and a fresh authenticator code and revoke every existing session.

## Architecture decision for this phase

Node **24.22.0 LTS**, Fastify and a single local SQLite database make the small administrator workload deployable without adding a shared database server to jig. SQLite uses WAL, foreign keys, prepared statements, transactions and schema version 2. This is a scoped change from the original planned PostgreSQL stack. The later customer runtime still needs its own ownership model, PostgreSQL/identity decision and tests; this identity schema does not implement private chat storage or row-level conversation policies. Run one service process; do not scale it into multiple replicas sharing this file.

Passwords use asynchronous scrypt (N=32768, r=8, p=1, random salt). API keys, prompt bodies and MFA seeds use AES-256-GCM with per-record authenticated context. The 32-byte vault master key is a separate mode-0600 file. This protects a stolen database without its key; it does not prevent the runtime or privileged infrastructure operators from decrypting records. The master key is never included in application releases or public assets.

Sessions are random opaque cookies whose hashes are stored server-side, with HttpOnly, Secure on HTTPS, SameSite=Strict and a `/backoffice` path. They expire after 30 minutes idle or 12 hours absolute. MFA is replay-protected, with a ten-minute freshness requirement for key changes. Bodies are size-limited; API schemas reject unknown fields and errors contain no raw input. Runtime request logging is disabled; Apache logs paths/statuses, not POST bodies.

## Local development

Use Node 24.22.0 LTS; the lockfile is committed.

```sh
cd backoffice
npm ci --ignore-scripts
node server/init-vault.mjs
npm run build
PORT=18765 PUBLIC_ORIGIN=http://127.0.0.1:8765 LOCAL_SETUP_ORIGIN=http://127.0.0.1:8765 npm start
# In another terminal, from the repository root:
python3 deploy/jig/open-admin-setup.py --local
```

The default private state is `backoffice/.state/`, ignored by Git. Initialization creates a new vault key and bootstrap token exclusively and refuses to overwrite existing files. The local bridge holds the bootstrap token in memory; it never sends it to browser code or prints it. Open `http://127.0.0.1:8765/backoffice/?setup=1` to enroll the first administrator yourself, then sign in at `/backoffice/` with a new authenticator code. Never use actual deployment data in development. Tests create their own temporary databases and synthetic secrets.

For frontend changes, `npm run dev` serves Vite on 4174 and proxies API calls to 8765; sign-in/setup must use the configured service origin or an explicitly matched development configuration. Built-service browser testing on 8765 avoids origin ambiguity.

## jig service boundary

The original static demo remains owned by `igurl` at `/home/igurl/domains/ai.igurl.dk/public_html`. The administrator service has its own unprivileged, non-login Unix user, **`ai-kundetype`**, and cannot read that home directory.

| Item | Path / value |
| --- | --- |
| Public administrator URL | `https://ai.igurl.dk/backoffice/` |
| Service | `ai-backoffice.service` |
| Release root | `/opt/ai-kundetypeassistent/releases/<revision>` |
| Active symlink | `/opt/ai-kundetypeassistent/current` |
| Isolated Node runtime | `/opt/ai-kundetypeassistent/runtime` |
| Private state | `/var/lib/ai-kundetypeassistent`, mode 0700 |
| Database / vault key | `backoffice.sqlite` / `vault.key` inside private state |
| Listener | `127.0.0.1:8765` only |
| Public origin | `https://ai.igurl.dk` |
| Release metadata | `/etc/ai-kundetypeassistent-release.env`, no secrets |

Deployment sources are `deploy/jig/ai-backoffice.service` and `deploy/jig/ai-backoffice-apache.conf`. Include the latter only in this hostname's HTTPS vhost. Its CSP permits same-origin API calls for `/backoffice/`; the demo retains its network-denying policy. Public `/backoffice/api/setup` is denied by Apache as well as the application's loopback/Host/proxy checks. HTTPS terminates at the existing certificate; no new public port or certificate is needed.

Release code and the runtime are read-only to the service user. systemd has a strict filesystem boundary, private temporary directory, empty capability set and access only to its private state for writes. Dependencies/install/build operations run as the release preparation user, not root. Root is used only for the scoped service/configuration installation.

## First-owner handoff

Enrollment is an owner action: do not enter a real password or authenticator seed for the user through tools. No bootstrap token or password is put into a chat message or query string.

An authorized operator starts the private bridge through the existing jig route, from the repository root:

```sh
python3 deploy/jig/open-admin-setup.py
```

The bridge obtains the private server's `bootstrap.token` through authorized SSH, without printing or persisting it, and injects it only into enrollment requests. jig disables generic TCP forwarding; the helper uses the existing SSH command channel to perform fixed loopback HTTP requests, without changing SSH configuration or opening a server port. A plain loopback request without the token is denied, including requests by another site's Unix user. Then the owner opens `http://127.0.0.1:8765/backoffice/?setup=1`, reviews the reserved name/email/username, creates a password of at least 14 characters and confirms their authenticator. The plain local `/backoffice/` address redirects to the public HTTPS login. HTTP here stays inside the trusted local machine and the encrypted SSH command channel. Setup requests fail if forwarded through the public website. After enrollment, the setup endpoint is disabled, and the owner signs in over public HTTPS. Close the helper with Ctrl+C when finished. Never screenshot, log or copy the enrollment seed into the repository or conversation.

## Backup and recovery baseline

As the service user, run the backup command with a new private destination:

```sh
STATE_DIR=/var/lib/ai-kundetypeassistent /opt/ai-kundetypeassistent/runtime/bin/node /opt/ai-kundetypeassistent/current/server/backup.mjs /var/lib/ai-kundetypeassistent/backups/<unique-time>
```

It snapshots the live database consistently with `VACUUM INTO`, copies the matching master key and writes checksums. Directories/files are 0700/0600; backups must stay outside web roots. A backup of the database without its key cannot decrypt credentials. This baseline is a local, access-controlled recovery copy, not an offsite encrypted backup policy. Offsite encryption, retention, scheduling, alerts and operational recovery exercises remain AK-049/067 scope.

To restore, stop only `ai-backoffice`, preserve the current state, verify both backup hashes, restore the database **and** corresponding key with the service user's ownership and original modes, and remove only the stopped database's stale WAL/SHM sidecars after preserving them. Check `PRAGMA integrity_check` on a separate restored copy and start the service. Do not mix a different key with a database. Schema 2 adds identity columns, owner protection triggers, invitation hashes and encrypted registration sessions. Migration is transactional and preserves the first existing administrator. Older schema-1 code refuses schema 2. After upgrade, rollback requires a schema-2-compatible build; a restore of the pre-upgrade database requires stopping the service, preserving all newer data and an explicit data-recovery decision. Never silently restore an old database during a code rollback.

Production recovery of a lost administrator factor/password is an operator-controlled procedure requiring identity verification and session revocation. Do not add a public reset/setup shortcut. This first version is for controlled administrator onboarding; a customer pilot still requires the remaining roadmap gates.

## Protected account and staff lifecycle — approved account update

The first enrolled account is internally protected. Staff APIs return only `Admin`, never a Main Admin role or protection flag. Other admins cannot change its name, email, username, status, role or delete it. A unique database index permits one protected account; database triggers also reject deletion and identity/privilege changes. Its own password-change flow remains available with both factors and revokes every session. This hides the special role label; it cannot promise that someone will never infer extra protection from a rejected action or operational history.

An operator can reserve the first identity before enrollment, as the service user, with `server/reserve-owner.mjs <name> <email> <username>` and the private `STATE_DIR`. This accepts no password or MFA seed. It refuses after any account exists, invalidates older setup sessions and enforces the reserved identity during the local enrollment. The setup form pre-fills those values. Do not put a real password in a tool, source file, shell history or screenshot. The owner enters it and confirms their authenticator themselves.

Additional staff are **Admin**, with access to backoffice customer metadata, projects, private prompt instructions, provider connection management and the activity log. They can invite and pause ordinary Admin accounts and Customers. Pausing revokes active sessions, and every request rechecks account/customer status and expiry. They have no impersonation capability or private chat endpoint. The legacy database table named `admins` now holds both identity roles; its role checks are enforced before any administrator route.

**Customer** registration opens a separate authenticated landing screen with only that customer's enabled assigned-project metadata. Customer sessions cannot read or mutate any administrator route. This landing page does not activate AI chat or expose the synthetic demo as a real account workspace. Shared project membership does not imply shared customer data.

## Invitations and mail

New Admins and Customers receive an invitation in the selected English or Danish language. Each token has 256 bits of randomness, is stored as a SHA-256 hash, expires after 48 hours and can activate one fixed account once. Resend invalidates the previous token and enrollment sessions; revoke does the same. Staff list screens expose status and resend/revoke controls, never bearer links. Passwords are never emailed. Existing customer emails cannot be reassigned through profile editing.

Invitation links place the token in the URL fragment, excluded from HTTP request/access-log URLs. The page removes it from browser history on load, holds it in memory, and starts enrollment only after the recipient presses Continue. A secure, HttpOnly, Strict cookie plus same-origin/CSRF checks binds the 20-minute enrollment. The seed is encrypted at rest and returned only to the invitation holder during enrollment. Password and a valid authenticator code are required before activation; the recipient then signs in with a new TOTP code. Reopening the email is necessary after refreshing the landing page. Mail scanners that only follow links do not consume invitations.

`MAIL_FROM=no-reply@ai.igurl.dk` uses Nodemailer 10.1.5 with the server's existing SMTP service on fixed `127.0.0.1:25`. STARTTLS is required and its certificate is verified for `jig.123url.dk`; the server's chain/hostname verification was checked. A fixed operator-configured sender, validated single recipient, disabled file/URL loading, bounded connection/socket timeouts and disabled protocol logging keep links out of app logs. This works with systemd `NoNewPrivileges` without granting queue-filesystem permissions. See the official [SMTP transport options](https://nodemailer.com/smtp). No third-party mail credentials are introduced. Without a mail transport, accounts remain pending and the UI reports failure. The MTA queue is responsible for delivery/retry; queue acceptance is displayed separately from confirmed delivery. The app has no bounce webhook or delivery-confirmation feed yet. A crash during send can leave `sending`; resending after a minute invalidates the uncertain link and safely recovers.

Application registration and invitation operations are rate limited, with a one-minute resend cooldown (failed sends can retry immediately) and fresh MFA for staff invitation changes. Current socket-level limits are shared behind Apache and should be tuned with trusted proxy boundaries and monitored during the pilot. Full transactional outbox processing, bounce handling and expiry/retention jobs remain follow-up operations work.

Sender DNS required in the `igurl.dk` zone:

| Type | Name | Value |
| --- | --- | --- |
| TXT | `ai` | `v=spf1 ip4:46.224.27.137 ip6:2a01:4f8:1c19:c06c::1 -all` |
| CNAME | `202608._domainkey.ai` | `202608._domainkey.igurl.dk.` |

The server already signs mail for the parent domain using selector `202608`. The subdomain must be included in its signer domain list, with the existing DNS public key reachable through the above CNAME. Verify DNS and a recipient's authentication results before calling delivery proven. Do not change other sites' mail routing or copy signing private keys into this project.

## English and Danish

A language selector is available on sign-in, private setup, invitation registration, customer landing and every backoffice tab. Navigation, forms, validation/API errors, status labels and audit descriptions use one shared catalog. Only the locale preference is kept in browser storage; credentials and sessions are not. Dates use the selected locale. Names, project descriptions, prompt content and other user records are never translated. Invitation language is selected per account. Admin and Customer role labels retain the requested names in both languages.
