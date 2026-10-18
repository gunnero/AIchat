# Customer workspace and private history

This batch replaces the root synthetic demonstration with the real invitation-only customer application. `/backoffice/` remains administration; `/demo/` remains an explicitly synthetic, in-memory demonstration. The approved monochrome option 1 layout is retained, including grayscale logo, project selector, private history, mobile drawer and English/Danish controls.

Customers can create, reopen, rename, search titles and permanently delete their own conversations, and save user messages. **AI replies are disabled.** There are no provider calls, simulated assistant messages, charges, attachments, sharing, packages or usage ledger in this batch. Allowances in the backoffice are still configuration only. Broader supplier/GDPR, recovery automation and customer launch requirements remain open.

## Identity and access

The existing invitation/password/TOTP system is retained. A root-scoped `__Host-ai_session` cookie (HttpOnly, Secure, SameSite=Strict, no Domain attribute) supports both applications. Customers arriving at `/backoffice/` go to `/`. Admins can use `/` for their own assigned workspace and switch back to `/backoffice/` with the Administration link. Old invitation URLs remain valid. Public first-owner setup is denied; private loopback setup and the reserved owner identity remain supported. A database trigger preserves the protected first Admin, whose displayed role is still simply Admin.

All conversation operations derive the customer from the authenticated session, check active account/expiry and project membership, and apply PostgreSQL forced row policies using a transaction-local session hash. No identity/configuration supplied by the client authorizes access. An Admin session resolves only that account’s separately provisioned workspace owner, when assigned. Its role gives no access to a customer’s or another Admin’s history. `ai_control` cannot read the private schema; `ai_chat` cannot read account, MFA or provider tables. Neither runtime role owns tables, inherits `ai_owner`, is a superuser or bypasses row policies. The operator-only `ai_migrator` can perform maintenance/backups; OS/DB operators remain technically privileged. This is not end-to-end encryption.

Conversations pin their customer, project and assigned immutable app configuration. Imported local prompt content stays fixed; Platform-managed links pin the prompt ID/connection and are intended to follow the published default when live AI is enabled. The app does not snapshot remote instruction changes. A changed assignment permits reading/renaming/deleting older history, but rejects new messages there. Revocation/pausing hides retained history; a regrant can make it visible again. Policy-bound transactions serialize with account/assignment edits; response delivery rechecks session and membership. Customers cannot edit message history or add assistant-role records. Deletion cascades to messages.

Titles and bodies use AES-256-GCM with record/customer/project context and the existing private vault key. Search decrypts only authorized title candidates in keyset batches; it never searches bodies or persists a plaintext title index. This first-release title search scans that customer's project titles; large-history performance should be measured before scaling. Audit entries contain no chat content. Customer API URLs are excluded from Apache's combined access log so search phrases are not logged. Private responses use `Cache-Control: no-store`; there is no service worker or sensitive local/session storage. In-memory drafts and request IDs are scoped per customer/project/conversation, cleared on unmount/logout, and stale responses are discarded. Browser restoration revalidates identity. Background project polling does not extend the 30-minute inactivity limit; the absolute limit remains 12 hours.

On refresh or navigation, `pagehide` clears private client state and unmounts the page without rendering a sign-in form in the departing document. This avoids triggering saved-password suggestions while the restored workspace opens. Actual sign-in retains username/current-password autocomplete hints but waits for the user to focus a field. Expired sessions still show sign-in, and a page restored from the back/forward cache reloads to revalidate identity.

Administrator confirmation is part of the action being performed. There is no separate “Verify access” header button. If a protected change needs fresh MFA, the server returns `reauth_required` and the app asks for a code, keeps the original form mounted and continues that exact request once after successful confirmation. Cancel returns to the retained form. Pending requests stay in memory only and are discarded on session expiry, page departure, unmount or sign-out. Incorrect/replayed codes (`invalid_otp`) permit a new code; an expired session returns to sign-in. Other permission errors and uncertain network failures do not trigger automatic mutation retries. The ten-minute server freshness rule, MFA replay protection and CSRF checks are retained.

Enrollment presents a locally generated, black-and-white authenticator QR code. The provisioning URI identifies the issuer as **AI Kundetypeassistent** and the account as the invited email address (or the reserved owner's email during private setup; unreserved private setup uses **Administration**). The same name is printed below the code in English/Danish. A collapsed manual setup-key option remains available, including for registration on the same phone. The QR is an inline SVG generated from the existing authorized enrollment response: no QR image service, additional secret endpoint, browser persistence or CSP relaxation is introduced. The existing six-digit SHA-1 TOTP/30-second settings, mandatory confirmation and private setup restrictions remain unchanged. Already enrolled accounts keep working and do not need to scan again.

## Personal account and Admin workspace

Both sidebars have an accessible **My account** button. The bilingual account dialog lets the signed-in person update their display name, see email/username, response allowance, assigned assistants and access expiry, and change password with their current password and a fresh authenticator code. It makes no payment claims: billing/packages and measured token usage are explicitly unavailable. The response allowance remains an unenforced configuration value until live AI/usage integration.

`GET /api/account` and `PUT /api/account/profile` derive the account from the authenticated session. Profile writes accept only `{name}` and require normal Origin/JSON/CSRF checks. The display name is stored separately from protected identity fields, returned by session/login and staff/customer lists, and logged only as a content-free event. Other Admins still cannot edit, pause, reinvite or delete the protected identity. Password change continues to revoke all sessions.

Admins use **Assign assistants** in the Admin list to configure project/prompt assignments and response allowance. `PUT /backoffice/api/staff/:id/workspace` requires fresh MFA and transactionally creates a separate workspace or updates its assignments. Cross-project versions fail atomically; a normal Admin cannot change the protected Admin's workspace. Internal Admin workspace owners are excluded from customer lists and cannot be edited through customer routes. Paused Admin accounts lose their workspace access; reassignment/revocation and private-history encryption work exactly as for customers. The protected Admin can assign their own assistants without changing their protected identity.

## Projects and instructions

Admins choose **Projects and prompts → Edit → Workspace colour** to assign black, yellow, purple or green. The sidebar, mobile drawer and header colour marker follow the selected assigned project for both roles. Names remain visible so colour is an additional cue. Existing/new automatic projects default to black; edits that omit a colour preserve the current setting. Unknown colours are rejected by the API/database and safely fall back to black in the browser. The fixed palette provides at least 4.5:1 text contrast on background, controls and hover states. Backoffice navigation and the white chat area retain the approved layout.

A verified API connection creates its linked app project, followed by **Connect an OpenAI prompt**. Enter the saved prompt ID once and edit instructions in OpenAI Platform. Existing app copies, customer assignments and chats are preserved. See [the current workflow, provider limits and migration rules](platform-prompts.md). AI replies and effective remote-version tracking are not enabled by this configuration batch.

## API

All mutations require the exact application Origin, JSON and session CSRF token. Unknown/unauthorized conversation IDs return the same 404. Routes are under `/api/customer`; authentication aliases `/api/auth/{login,session,logout,password,reauth}` retain the existing backoffice endpoints.

| Method and path | Behavior |
| --- | --- |
| GET `/projects` | Own enabled assigned project display metadata; `aiEnabled:false`. |
| GET `/projects/:projectId/conversations?q=&limit=&cursor=` | Title-only search, up to 50 results, authenticated encrypted cursor. |
| POST `/projects/:projectId/conversations` | `{requestId:UUID}` creates or retries a conversation; server chooses owner/version. |
| GET/PATCH/DELETE `/projects/:projectId/conversations/:id` | Read metadata; rename with `{title}` (1–120 characters); delete with `{}`. |
| GET `/projects/:projectId/conversations/:id/messages?before=&limit=` | Ordered message page, up to 100 results, with older-message cursor. |
| POST `/projects/:projectId/conversations/:id/messages` | `{text,requestId:UUID}` saves up to 20,000 characters as a user message. |

Creation retries reuse the customer's request identifier. Message writes lock their conversation, assign increasing sequence numbers and deduplicate requests. Reusing an identifier for different content is rejected. Titles derive from the first message until manually renamed. Empty titles display a localized “New conversation”. No browser draft is claimed saved until the server confirms it.

## Usage and costs

Admins have **Usage & costs** for assigned response allowances and a separate OpenAI organisation reporting connection. The owner will enter that reporting key through the secure backoffice later. Organisation spending includes Platform tests and other tools; individual app tokens/costs remain unmeasured while live AI and accounting are disabled. [Reporting sources, permissions and recovery](usage-and-costs.md).

## PostgreSQL and migration

Production uses PostgreSQL **18**, schema **8**, Node **24.22**, and the existing single Fastify service. SQLite remains only for legacy tests and an explicit one-time import. Startup requires `CONTROL_DATABASE_URL` and `CHAT_DATABASE_URL`, checks the runtime roles/schema and fails closed; it never opens SQLite as a fallback.

On jig the dedicated `18/ai` cluster uses port 5433 **only as a Unix socket** in `/run/postgresql-ai`; `listen_addresses` is empty. Peer mapping permits the non-login OS service account `ai-kundetype` to use only `ai_control`/`ai_chat`, and the non-login operator account `ai-migrate` to use `ai_migrator`. There are no database passwords in the service or browser. Database files belong to postgres; application code stays root-owned/read-only and the vault/journal stay in private service state. PostgreSQL logs omit statements, bindings and detail fields.

Current additive upgrade: schema 7 → 8 expands the existing appearance constraint to allow canonical six-digit hexadecimal colours alongside the four presets. The colour picker previews the derived sidebar palette; text/control contrast is at least 4.5:1. No arbitrary CSS or URLs are accepted. Assignment checks and chat ownership are unchanged. Backups support schemas 3–8. Rehearse a schema-7 backup restore/upgrade before activation. Recovery needs schema-8-compatible startup/backup helpers; prior clients display custom colours as black while retaining stored values until forward repair. Never rewind PostgreSQL writes for appearance changes.

Earlier additive upgrade: schema 6 → 7 adds an encrypted organisation reporting connection without changing identity, project assignments, colours or history. Backups/restores support schemas 3–7. Use schema-7-compatible recovery code to preserve current PostgreSQL writes; [reporting recovery details](usage-and-costs.md#interfaces-and-recovery).

Earlier schema 5 → 6 upgrade: run `server/migrate.mjs` as the operator after a fresh PostgreSQL/vault/journal backup. Schema 5 → 6 adds `project_appearance` and the assignment-scoped `chat_workspace_projects()` metadata function. It preserves identities, enrolled credentials, sessions, assignments and encrypted history. `ai_chat` has execute-only access to this function and no direct table access. Backups/restoration support schemas 3–6. Rehearse the previous-schema restore and upgrade before activation; after migration, use schema-6-compatible code or a forward repair that preserves current PostgreSQL writes. Do not rewind a database to recover a colour/UI change. The prior application's only required compatibility change is its startup schema guard; existing project tables/functions remain unchanged.

Earlier schema 4 → 5 added personal display-name profiles and Admin workspace ownership, and updated the session-to-owner row-policy function. New Admin workspaces are provisioned only through a fresh-MFA-authorized assignment action and receive new owner IDs; no customer history is reused. Schema 3 → 4 prompt links remain an earlier upgrade. [Details](platform-prompts.md#migration-and-recovery).

Original SQLite cutover procedure:

1. Preserve service unit, non-secret release environment and ai-only Apache includes outside active include paths. Record unrelated vhost hashes. Create a consistent SQLite/vault checkpoint using the old release's backup tool.
2. Rehearse `server/migrate.mjs <checkpoint>/backoffice.sqlite` into the separate empty `ai_rehearsal` database as `ai-migrate`, with `MIGRATION_DATABASE_URL` pointing to that database. The importer verifies legacy schema 2 (or fixture schema 3), SQLite integrity/FKs and every imported row; it preserves all identity/configuration IDs, password hashes, MFA ciphertext/replay counters, owner reservation/protection, assignments, credentials, pending invitations and audit records. It emits counts only.
3. Validate a PostgreSQL backup/restore rehearsal and private role restrictions. Stop the application, take a second final SQLite/vault checkpoint, and import that checkpoint into the empty `ai_customer` database. Import refuses an existing target schema rather than silently skipping newer SQLite records. Authentication/setup/registration sessions are deliberately invalidated once; users keep their enrolled credentials.
4. Point the service at verified PostgreSQL connections and the reviewed release; validate/reload only the ai Apache configuration. Serve the demo from its own `/demo/` build with a matching asset base. Retain the old release and SQLite checkpoint offline.
5. Once PostgreSQL accepts new writes, use a forward repair or a PostgreSQL restore that preserves new writes. **Never switch back to the old SQLite snapshot.** The migration checkpoint is not a post-cutover rollback database.

## Backup and deletion-safe recovery

Run `server/backup.mjs <new-private-directory>` with `BACKUP_DATABASE_URL` set to the operator Unix-socket connection, `STATE_DIR` set to private service state and PostgreSQL 18's `pg_dump` on PATH. The tool writes a consistent custom-format dump, matching `vault.key`, `deletions.jsonl` and SHA-256 manifest, all mode 0600 inside a 0700 directory. Keep the vault with the dump. The new tool requires PostgreSQL unless `LEGACY_SQLITE_BACKUP=1` is explicitly selected for old fixtures/checkpoints.

Each confirmed conversation deletion inserts a content-free database tombstone and fsyncs an independent private deletion journal before committing. The journal contains IDs and time, never titles/bodies. Retain the latest journal independently of database snapshots, including with offsite backup operations. A failed database commit after journal fsync may preserve the customer's requested deletion for recovery; it cannot delete someone else's conversation.

Restore while offline into an **empty isolated database**, using PostgreSQL 18's matching client, the matching vault and the **latest independent journal**, not merely the older copy packaged with the snapshot:

```sh
MIGRATION_DATABASE_URL='<operator connection to empty isolated target>' \
  node server/restore.mjs /private/backup /private/latest/deletions.jsonl
```

The restore verifies checksums, restores schema/data, merges tombstones, removes deleted conversations/messages, verifies removal and revokes all sessions before returning success. It writes the merged journal next to the supplied input as `<journal>.replayed` (0600); copy that merged file into runtime state when activating the restored database. It refuses a missing journal or an existing application database. Restore the vault and merged/latest journal into private runtime state before enabling traffic. Keep later independent journal entries when restoring an older snapshot. Do not enable the restored application if any step fails. Offsite scheduling, journal retention/loss recovery, monitoring and recovery objectives still need the separate operational release work; this batch does not promise immediate erasure from historical backup media.

## Verification

`npm run check` in `backoffice/` runs legacy account tests, PostgreSQL integration tests when configured, customer UI tests and a production build. CI always supplies PostgreSQL 18 and two disposable databases, and tests real dump/restore with matching clients. Local integration runs require `TEST_DATABASE_URL`, `TEST_RESTORE_DATABASE_URL`, and `PG_DUMP`/`PG_RESTORE` pointing to version 18 clients. Test roles/passwords in `tests/postgres-ci.sql` are exclusively disposable CI fixtures; never use them on jig.

Coverage includes two customers with shared/separate projects, both Admin identities, direct-ID/search/page isolation, RLS denial without context, pool context cleanup, retry ordering/deduplication, revoked/expired access, changed prompts, encrypted storage, migration, invitation registration through PostgreSQL, backup restoration after a later deletion, safe text rendering, per-project drafts and stale responses after switching accounts. Email is fake and OpenAI is never contacted. The original demo checks, Sites artifacts and production guard remain required.

Browser review used synthetic local accounts: password/TOTP login, save then refresh/reopen, English/Danish, desktop 1280×720 and mobile 390×844, mobile project switching and a focus-contained native dialog drawer. Review found and fixed a shared footer-style collision affecting composer width. Synthetic records and keys are excluded from deployment.
