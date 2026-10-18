# API connection and one-time instruction import

Adding a verified API connection now creates a local app project with the connection's name and immediately opens **Import prompts**. The app does not create a new OpenAI Platform project or copy its remote project name. The administrator enters the existing OpenAI `proj_…` ID and its project key. Key encryption, fresh MFA, CSRF and fixed-endpoint validation remain enforced. The connection and its app project commit together; a failed connection check or failed project write leaves neither record behind.

For an existing connection, **Open project** reuses its linked app project. If none exists, it creates one using the same transaction. Concurrent requests reuse that project. Existing names, connection links, prompts and customer assignments are preserved. A name collision gets a numbered suffix instead of changing another project's link. This release does not backfill legacy connections at deployment or on reads.

## Moving instructions once

The administrator can paste the actual instructions and give them a name, or expand **Import from a file** and choose a UTF-8 `.txt` file or the app's JSON bundle below. A text file fills editable fields. A bundle previews the names and exact instructions before the administrator clicks **Import prompts**. Files are read in browser memory; the app submits validated instructions to the authenticated API. It does not persist the source file or drafts. State is discarded on sign-out, expiry, page departure or a different account.

A saved prompt reference (`pmpt_…`), API example or API key alone does not contain the instructions and cannot be imported as instructions. Obtain the actual reviewed content from the source owner first. The optional source reference can record its original prompt ID and version. Imports preserve instruction whitespace/line endings, compute a SHA-256 checksum and encrypt the text using the existing vault. The app's project-to-connection relationship preserves provider project provenance; a supplied source `projectRef` must match it.

This is a **one-time move**, not ongoing synchronization or automatic discovery of OpenAI prompt libraries. OpenAI's [migration guide](https://developers.openai.com/api/docs/guides/prompting/migrate-from-prompt-object) and [deprecation schedule](https://developers.openai.com/api/docs/deprecations#2026-06-03-reusable-prompts), verified 18 October 2026, schedule reusable prompt objects / `v1/prompts` to shut down on 30 November 2026. No documented prompt-library listing/export interface usable with the project key was verified. This implementation uses no undocumented dashboard endpoints, Admin API credentials, Assistants endpoints or `v1/prompts` runtime dependency.

## Portable bundle format

This is this app's interchange format, **not a claimed OpenAI export format**. Use `.txt` or paste for a single prompt. For a prepared multi-prompt migration file:

```json
{
  "format": "ai-kundetypeassistent-prompts-v1",
  "projectRef": "proj_synthetic_example",
  "prompts": [
    {
      "name": "Example assistant",
      "instructions": "Reviewed synthetic instructions only.",
      "sourceRef": "pmpt_synthetic_example v2"
    }
  ]
}
```

`projectRef` and each `sourceRef` are optional. The name and nonblank instructions are required. Limits: 256,000 bytes per file/request, 1–20 prompts, names up to 80 characters, instructions up to 48,000 characters each, source references up to 150 characters. Unknown fields, unknown formats, duplicate names within a bundle and mismatched source projects are rejected. Do not put API credentials or personal customer conversations in a bundle.

Each new logical prompt starts at immutable app version 1. An identical existing name/content checksum/source reference is skipped on retry. A conflicting existing name rejects the entire batch, including earlier items in that batch. Open the existing prompt and explicitly save a new version instead. Imports never publish to customer assignments automatically and never overwrite prior versions. Select the reviewed version explicitly when assigning access. Existing conversations keep their current pinned version.

## Administrative API and verification

- POST `/backoffice/api/connections` returns `{id, projectId, projectCreated:true}` after connection/project creation.
- POST `/backoffice/api/connections/:id/project` with `{}` returns `{projectId, projectCreated}` and is idempotent for legacy/project navigation.
- POST `/backoffice/api/projects/:id/prompts/import` accepts `{projectRef?, prompts:[{name,instructions,sourceRef?}]}` and returns `{projectId, imported, skipped}`. The file-format marker is validated/removed by the browser before submission.

All routes require an active Admin session, application Origin and CSRF. Customer sessions cannot use them. Admins retain no access to unshared customer conversations. Control transactions serialize duplicate checks and inserts in PostgreSQL and the SQLite fixtures; no provider call runs inside these transactions. Activity records contain action and record IDs, never imported instructions, API keys or file bodies.

Automated checks use fake provider/mail adapters and synthetic data: atomic connection creation, legacy concurrent navigation, encrypted exact imports, conflicts/rollback, repeat/concurrent imports, cross-project source binding, untouched assignments/private histories, role/CSRF denial, invalid/oversized files, safe literal rendering, stale file reads, English/Danish and connection-to-import navigation. PostgreSQL 18 integration exercises both Admin identities and private histories. Source-owner migration, evaluation against the actual instructions, customer publication and live AI remain separate release requirements; this UI alone does not complete AK-061.

No schema, dependency or account/MFA migration is needed. Deploy the reviewed code with a fresh PostgreSQL/vault/deletion-journal backup. Preserve current PostgreSQL writes during any code rollback; do not reactivate SQLite.
