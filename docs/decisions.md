# Decision register

The baseline is [PROJECT.md](../planning/PROJECT.md). Unresolved inputs are not treated as approved.

18 October follow-up: the user requested a real administrator backoffice first, with client-owned OpenAI keys added later through its UI. [Backoffice architecture](backoffice.md) records the persistent administration phase and its narrower staff-authentication/storage decisions. The customer launch decisions below remain open where marked.

| Topic | Current decision | Remaining input / task |
| --- | --- | --- |
| Audience | Individual customers; Danish UI. | Account count and concurrency, AK-001/014. |
| Accounts | Invited, customer-controlled identity; email links initially; admin MFA. | Provider/recovery validation, AK-017–022. |
| Payments | External; manual entitlements first. | Renewals, cancellations, refunds, AK-028/031. |
| Privacy | Private history; only expressly shared copies visible to admin. | Roles, lawful bases, sensitive data, retention and DPIA assessment, AK-042. |
| Sharing | Fixed selected messages, revocable future access. | Production enforcement and deletion, AK-025/027/044. |
| Projects | Multiple projects per customer; one assigned prompt version per project. Private owner/project histories; existing chats keep their binding. | Production membership/routing and isolation, AK-060/062. |
| Prompt source | App manages assignments and portable prompt versions; existing OpenAI Platform configuration is an import source. | Reusable prompt-object shutdown on 30 November 2026 requires migration; AK-061. [Details](projects-and-prompts.md). |
| Design | Approved option 1 layout; black-and-white palette requested on 18 October 2026. | Higher-resolution original logo for later polish. |
| First build | In-memory deterministic demo. | Genuine speed/cost measurements need the API pilot. |
| AI behavior | Approved instructions and retrieval; no automatic training on chats. | GPT materials, rights and evaluation examples, AK-011. |
| AI service | Server-only future adapter. | Owner, model, region, retention eligibility, AK-010–014/047. |
| Usage | Customer answer allowance separate from internal tokens/cost; demo allowance shared across assigned projects. | Per-project charging, pricing, standard-answer definition, rollover, resets, AK-028. |
| Speed | Provisional median 2s / p95 5s to first readable text. | Real quality, cost, total answer time and load. No guarantee. |
| Hosting | Desired EU app/database/backups. | Vendor, domain, budget, agreements, ownership, AK-047/049. |
| Security | Deny-by-default backend/database checks later. | No production security claim from frontend controls. |
| Uploads | Admin knowledge ingestion core; customer uploads optional. | AK-036 and optional AK-057. |
| Release | Limited invited pilot before broad availability. | Legal, security, privacy, cost, quality and recovery evidence, AK-053–056. |

Names, prices, allowances and dates are demo fixtures only. State resets on reload. Customer uploads, payment webhooks, teams, public sharing and autonomous external actions are outside this batch.


18 October account update: the user requested username/email login, mandatory TOTP for all accounts, a protected first administrator internally (displayed as Admin), ordinary Admin and Customer roles, recipient-selected passwords through emailed invitation links, and English/Danish backoffice screens. Use `no-reply@ai.igurl.dk` with the existing local MTA, subject to sender-authentication DNS verification. This replaces the initial email-link-only sign-in direction for this identity foundation; invitation links enroll an account, while subsequent sign-in requires password plus TOTP. Customer chat storage and managed-identity/PostgreSQL migration remain separate decisions.
