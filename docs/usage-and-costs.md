# Usage and costs

Admins open **Usage & costs** in the backoffice or `/backoffice/?view=usage`. English and Danish are supported. Customers cannot access these reports. Both ordinary and protected Admins have the same displayed role; no protection flag is returned. The report reads account, assignment and allowance metadata without access to private conversation titles or bodies.

## App allowances

The app lists each Customer and Admin workspace once, plus Admins without a workspace at zero allowance. Display names, account status, expiry, assigned projects and configured response allowance come from current server records. Search and project filters run in memory. A shared read transaction serializes the metadata snapshot with configuration edits; a person’s allowance is never added again for each assigned project.

Allowances are response configuration, not purchased tokens, measured consumption, money or an enforced remaining balance. Live AI replies remain disabled. Individual tokens, spending and remaining balances are explicitly **not measured**; no private-message word counts or provider-wide averages substitute for actual accounting. The future live-AI runtime and AK-029/030 ledger/limits must implement attribution and enforcement before customer usage balances can be displayed.

## OpenAI reporting connection

The owner chose to add the reporting credential themselves later through **Connect reporting**. Use a dedicated OpenAI organisation **Admin API key** with Usage and Costs access. Existing project chat keys are rejected by purpose and are never reused for reporting. The app supports one reporting organisation at a time. Replacing the key switches the source; no historic report snapshots are merged across organisations.

Before saving a new/replacement key, the server checks a completed UTC day through both fixed reporting endpoints. Saves and disconnects require the exact Origin, JSON, session CSRF and fresh MFA. Session/MFA and connection revision are rechecked after network work and under the write transaction. Failed checks preserve the existing key. Disconnect clears the ciphertext while advancing its revision; reconnect cannot revive an old revision or expose an old organisation’s pending response. Disconnect does not revoke the credential in OpenAI or change project connections.

Schema 7 stores only the connection label, AES-GCM key ciphertext, four-character suffix, monotonically increasing revision and update time. Plaintext is never returned to the browser, put into a URL, audit event or operational log. The `ai_chat` role has no access to this table. No reporting credential was provisioned or installed during implementation or deployment.

## Source, scope and accuracy

Monthly reports use UTC, for the current month or preceding 23 months. The current month ends at the fetch time. All provider pages must complete before a result is returned; failed, repeated, oversized or malformed pages yield an error rather than a partial total. Each response is limited to 4 MiB, each endpoint to 12 pages, the combined report to 50,000 result rows and the request to 15 seconds. Redirects and arbitrary provider URLs are rejected. Provider error bodies are cancelled without being read or relayed.

Spending comes from OpenAI’s [Costs API](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs), grouped by project. It includes other tools, Platform tests, projects not connected in this app and costs not allocated to a project. Only USD reports are accepted; another or missing currency fails closed. Decimal values, including credits and sub-cent amounts, are accumulated with fixed decimal arithmetic to 12 places. These are provider reports, not customer payments, purchased credit balances or a final invoice.

Input/output tokens and model requests come from [Completions Usage](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/completions). Cached input is already included in input tokens and is not added again. Other paid services may contribute to costs without appearing in this model-token total. OpenAI reporting may arrive late; month and last-fetched time remain visible. Unavailable values show a dash, while a successful empty report can show zero.

Provider project IDs are matched to local project names only for display. This does not attribute the organisation’s costs to this app or to individual customers. Reports are not persisted or cached server-side; browser state is discarded on sign-out, departure and session expiry. Month/key changes invalidate pending client results, and the server rejects a report if the connection revision changes during retrieval. There is no automatic background synchronization.

## Interfaces and recovery

All routes are Admin-only under `/backoffice/api/usage`:

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/` | Current allowances, safe account metadata and connection metadata; makes no provider calls. |
| GET | `/openai?month=YYYY-MM` | Complete read-only organisation report for one UTC month. |
| POST | `/connection` | Verify/store or rotate `{label,apiKey,revision}` after fresh MFA. |
| DELETE | `/connection` | Clear the credential with `{revision}` after fresh MFA, retaining a monotonic tombstone. |

OpenAI’s [Administration Overview](https://developers.openai.com/api/reference/administration/overview) describes the distinct Admin credential requirement. The app never uses this credential for generation, project mutation or other administration endpoints.

Schema 6→7 adds `usage_reporting` without changing identities, passwords/MFA, project colours, assignments or history. Backups/restore support schemas 3–7 and include encrypted reporting records with the matching vault and deletion journal. Rehearse a schema-6 backup restore/upgrade before activation and create fresh private backups before migration and after the schema-7 upgrade. Use schema-7-compatible recovery code; never rewind PostgreSQL writes for a reporting/UI change. Runtime recovery from the prior application requires the reviewed schema-7 startup guard and backup schema whitelist; normal runtime routes remain compatible with the additive table.

Tests use synthetic keys, fake provider responses and fake mail. Live provider totals cannot be verified until the owner enters their reporting key. Do not close broader customer-accounting tasks based on this administrator reporting milestone.
