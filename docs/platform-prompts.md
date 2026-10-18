# Prompts managed in OpenAI Platform

The owner clarified the workflow on 18 October 2026: configure and edit the assistant in OpenAI Platform, link each saved prompt once by its ID, and avoid copying instructions into the app. This supersedes the previous one-time text-import onboarding. The accepted scope is Platform-only instruction editing, not automatic prompt-library discovery or two-way editing.

## Administrator workflow

1. Create/save the assistant prompt in the existing OpenAI project.
2. Add that project's API connection in the app. A local app project is created atomically.
3. In **Connect an OpenAI prompt**, enter its `pmpt_…` ID once. The display name defaults to the app project's name.
4. The project shows **Managed in OpenAI · Published default** and **Edit in OpenAI**. Make instruction/configuration changes in Platform. No instructions field or import step is shown for linked prompts.

Existing connections retain **Open project**, and existing app projects have **Connect an OpenAI prompt**. Previous imported prompt records and assignments remain intact. Connecting the same provider prompt in one app project is idempotent. Another name with an already used display name is rejected rather than replacing that record. Linking a different prompt creates a separate app configuration; it does not silently update customer memberships or conversations.

**AI replies remain disabled.** Saving a link validates the ID syntax and local project/connection binding. It does not call OpenAI, test access to that prompt or claim to have downloaded its instructions. The existing connection check probes model-list access only. The UI states this distinction.

## Runtime contract and provider limits

The stored mode is `platform`, with a project-bound connection, provider prompt ID and `version_policy: default`. When the live-AI batch is implemented, the Responses request should reference `prompt: {id: "pmpt_…"}` using that project's server-held key/header, without copying local instructions or overriding the Platform configuration. Omitting a fixed remote version is intended to follow the published default in Platform. This contract is saved now; no generation route or automatic synchronization worker is enabled by this batch.

Official source verification on 18 October 2026:

- The [Responses reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/create) documents the prompt reference with ID, optional version and variables.
- The [Assistants migration guide](https://developers.openai.com/api/docs/assistants/migration) describes dashboard-managed prompts that hold model/tools/instructions and can point to the latest version. Its Assistants API is retired; it is not an implementation fallback.
- No documented API for listing/downloading the saved prompt library or writing prompt edits back to Platform was verified. Do not claim API-key-only prompt discovery, prompt-content download or two-way synchronization, and do not use private dashboard endpoints.
- The newer [prompt-object migration guide](https://developers.openai.com/api/docs/guides/prompting/migrate-from-prompt-object) and [deprecation schedule](https://developers.openai.com/api/docs/deprecations#2026-06-03-reusable-prompts) schedule reusable prompt objects / `v1/prompts` to shut down **30 November 2026**. The owner accepted this limit when selecting ID linking. This is a transitional integration, not a long-term replacement for the documented migration. A replacement path and actual account/prompt verification remain release work.

Saved app versions pin the **link/configuration**, not a downloaded copy or checksum of remote instruction content. Remote edits are not detected or snapshotted by the app. For Platform links, future replies will intentionally follow Platform's published default; unpublished edits or a fixed older remote version are not promised to apply. Actual effective-version provenance, template variables, tool behavior, representative evaluations, unavailable/deprecated prompts and rollout rules must be handled before enabling live AI. Previously imported local instructions remain immutable app versions. Customer ownership, revoked access and read-only history after an app-assignment change remain enforced.

## Storage and API

PostgreSQL schema **4** adds `platform_prompt_links`, keyed by the immutable app `prompt_versions` record. Composite foreign keys bind its project/version and project/connection. The same provider ID may be linked in separate app projects, but only once in each. The control role can select/insert links and cannot update/delete them; the chat role cannot read them. The empty encrypted legacy instructions column for these records is not remote content and is never returned as an instruction editor. Link checksums identify the link configuration only.

POST `/backoffice/api/projects/:id/prompts/link` accepts only `{name, providerPromptId}` and returns `{id, projectId, linked:true, created}`. It requires an active Admin session, Origin and CSRF. There is no client-selectable connection, owner, instruction content or remote version override. GET `/prompts` includes `source_kind`, `provider_prompt_id` and `version_policy`; GET `/prompts/:id` omits the instructions field for linked records. The existing local instruction-write route refuses linked prompt families. Audit entries contain action/record IDs only.

The old text-import backend/fixture component is retained for compatibility and migration tooling, with [its documented format](prompt-import.md); it is no longer the normal onboarding UI. Existing imported records are not converted, deleted or rebound automatically.

## Migration and recovery

Run `server/migrate.mjs` as the migration operator against the current PostgreSQL database, after a fresh backup. Schema 3 → 4 is additive and transactional: one binding index, the link table, restricted grants and the schema-version record. Existing account/password/MFA/owner records, ciphertext, invitations, assignments, histories and sessions are unchanged. Rerunning schema 4 is a no-op. Fresh installations apply the existing schema 3 foundation then this upgrade. SQLite is fixture/import-only; the importer accepts legacy schema 2 and fixture schema 3, preserving optional link records as well.

The updated backup/restore tools support PostgreSQL schemas 3 and 4, record/check the actual schema, and retain deletion-safe recovery. A restored schema-3 snapshot must be upgraded while isolated before activating schema-4 code. Never restore an old snapshot over newer production writes merely to roll code back. After schema 4 is active, recovery requires a schema-4-compatible code release or forward repair; the earlier schema-3 executable fails its startup check. Preserve the matching vault and latest independent deletion journal throughout recovery.

Tests use fake mail/provider adapters and synthetic data. Coverage includes linking without instructions, concurrent retries, no silent overwrites, project/connection constraints, role/CSRF denial, blocked local editing, preserved pinned histories/MFA/owner/sessions, schema upgrade idempotency, link-aware dump/restore, and English/Danish connection-to-link UI. Actual provider access/default-version behavior is not claimed tested until a live-AI integration test uses the owner's selected prompt.
