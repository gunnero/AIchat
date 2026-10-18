# ADR 001 — application foundation

Status: accepted for the first prototype batch; supplier provisioning and production controls remain separate tasks. Date: 16 October 2026.

Updated 18 October 2026: [projects and prompts](projects-and-prompts.md) adds multiple projects per customer, a specific prompt version per assignment, private customer/project history and an OpenAI source-import/migration plan. The demo implements these interactions in memory; the server/database controls remain planned.

## Decision

Use React/TypeScript for the web client, Vite for development and bundling, locally served Source Sans 3, and Phosphor's light/regular outline icons. Option 1 is the visual target. No browser-side OpenAI SDK, remote fonts or database credentials.

The intended production shape is a same-origin TypeScript API (Fastify), PostgreSQL, and a managed identity service through a server-side session adapter. Keep client and API as separate packages so UI state is not confused with policy enforcement. This batch implements only the client and mock domain functions.

| Concern | Decision and boundary |
| --- | --- |
| Frontend | React/TypeScript in app/; explicit state and small feature components. |
| Backend | Planned Fastify API in a separate service behind same-origin /api; streaming lifecycle, ownership and quotas enforced here. Not implemented yet. |
| Database | Planned PostgreSQL with migrations, foreign keys, owner IDs and row policies. Runtime roles must not bypass ownership rules. |
| Authentication | Managed email-link identity and revocable server sessions. Supabase Auth is the initial candidate; verify recovery, MFA, region and commercial terms before provisioning. |
| Email | Dedicated transactional email adapter. Final provider needs acceptable delivery, DPA and regional processing alongside the identity provider. None provisioned. |
| AI | Future server-only provider adapter, dedicated credentials and approved knowledge/instructions. Model, features, region and retention require AK-010–014 and privacy review. |
| Hosting | EU app/database/backups desired. EU VM hosting plus managed EU PostgreSQL, or a managed EU application platform, are candidates. Vendor, region and operational access decisions belong to AK-047/049. |
| Storage today | In-memory synthetic data; no real identity, persistence or cross-tab synchronization. |
| Environments | Local mock development now. Isolated synthetic staging and production projects later, with independent secrets, storage and budgets. |

## Alternatives and trade-offs

Next.js would consolidate routing and server rendering, but this authenticated chat workspace has little initial SEO need. A Vite client makes the first review quick and the later API boundary explicit; the trade-off is a separate backend deployment.

A hosted backend can combine identity and PostgreSQL but still requires server authorization and supplier review. Self-hosted authentication increases recovery, email and security maintenance, so managed identity is preferred. Specific suppliers remain open rather than committing to costs or regional promises.

Plain HTML suits a screenshot but becomes harder to maintain for streaming, per-conversation drafts, snapshots and admin states. React state and TypeScript provide a coherent foundation for those interactions.

## Production boundaries

1. The verified session determines the owner; client-supplied IDs never establish permission.
2. Private lists, titles, messages, search, summaries and exports are owner-scoped. Account administration does not grant chat access.
3. Shares identify a recipient and immutable selected-message snapshot. Revocation prevents future reads. No public bearer links; copies saved by the recipient cannot be recalled.
4. Credentials stay in the server secret store. VITE_ configuration is public and must never contain secrets.
5. Status, quota reservation and cost limits are checked before provider calls. Atomic accounting is AK-029 onward; demo counters are not a billing ledger.
6. Output is rendered as text. A future Markdown renderer must sanitize links/HTML.
7. Logs exclude content, credentials and login links. Retention covers provider objects, caches, exports and backup deletion replay.
8. Transport/storage encryption does not imply end-to-end encryption or prevent all privileged infrastructure access.
9. Real customer-data pilots wait for the roadmap's privacy, supplier and security gates.

## Structure

- App.tsx: customer workspace and demo orchestration.
- Admin.tsx: account metadata and expressly shared copies; receives no private chat collection.
- domain.ts: synthetic fixtures, immutable snapshots, invitation validation and abortable response simulator.
- Modal.tsx: native dialog focus handling.
- MessageText.tsx: text/heading rendering without HTML interpretation.
- styles.css: design tokens and responsive states.
- tests/: behavioral harness for subsequent integration work.

## Implementation sources

- [Vite guide](https://vite.dev/guide/) — runtime and TypeScript support.
- [Phosphor React](https://github.com/phosphor-icons/react) — icon weights and integration.
- [Adobe Source Sans](https://github.com/adobe-fonts/source-sans) — font source and license.

These sources support implementation choices, not supplier/privacy approval. Recheck provider documentation before production integration.
