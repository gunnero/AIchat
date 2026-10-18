> The real customer workspace now persists owner/project-scoped conversations and pins assigned prompt versions. Assignment changes make earlier histories read-only for messaging; revoked access hides retained histories. AI and sharing remain disabled there. See [customer workspace](customer-workspace.md). The demo sections below still describe synthetic /demo/ behavior.

# Projects, prompt versions and customer assignments

Meeting update, 18 October 2026: customer access and prompt assignments are managed in this application. The intended source configuration is created in OpenAI Platform. A customer may access multiple projects, with one explicitly selected prompt version per project. Project names do not change the approved black-and-white palette.

Later on 18 October the user requested a **real backoffice first**. The separate `backoffice/` service persists administrator-owned connections, projects, immutable encrypted prompt versions and customer assignments. Keys are entered by the owner through authenticated UI; manual instruction import is supported without promising saved-library synchronization. The synthetic demo described below remains unchanged. [Implementation, limits and operating runbook](backoffice.md).

## Example

| Customer | Project | Assigned prompt |
| --- | --- | --- |
| Sofie | green | Helle, v1 |
| Sofie | yellow | Aleksandar, v1 |
| Maria | green | Aleksandar, v1 |

Sharing a project does not share customers' conversations. Sofie and Maria retain separate histories inside green. The customer chooses an assigned project; Helle chooses its prompt/version for that customer.

## Working demo

The administrator can create or edit a project entry, pause it, add prompt references and append new prompt versions. Under **Kunder → Administrér**, project checkboxes enable multiple assignments and each project has its own prompt-version selector. Invitations may initially have zero assignments.

The customer switcher shows valid assigned projects only. History and drafts stay scoped to the customer and project. New chats pin the selected assignment's prompt/version. Changing an assignment makes old chats read-only; a new chat uses the new assignment. Creating a new prompt version does not silently update existing assignments. Pausing/removing access hides the project and retains its history; zero access has an explicit empty state. Expressly shared copies retain their customer/project origin.

These are synthetic in-memory interactions. The catalogue contains fictional `proj_demo_` / `pmpt_demo_` source references and prepared replies. It does not query OpenAI, import real prompts, authenticate an administrator, or enforce database policies. Real instructions, credentials and customer information must not be pasted into this public demo. Reload resets it.

## Production model

| Record | Required relationship / invariant |
| --- | --- |
| Project | Application ID, display name, active state, restricted provider connection reference. |
| Prompt | Logical identity belongs to exactly one project. |
| Prompt version | Immutable content, source metadata and publication state; unique project/prompt/version key. |
| Membership / assignment | Unique customer/project pair, referring to a published prompt version in that same project. |
| Conversation | Customer owner, project and pinned prompt/config version; these values cannot be silently reassigned. |
| Share | Explicit selected-message copy with owner/project provenance and revocation state. |
| Usage entry | Customer, project, prompt version and request identifiers; no chat content. |

The authenticated API must verify account/entitlement status, project membership and the exact prompt binding. It chooses the approved provider connection and instructions server-side. Client-supplied project/prompt/owner values never establish authorization. Read, search, retrieval, summaries, provider state, cache keys and exports need both customer and project scoping. Project membership alone never grants access to another customer's history. Revocation must stop later stream delivery and reject later writes, including requests already in flight.

End customers need accounts in this application; they do not need membership in Helle's OpenAI Platform projects. Provider secrets stay in a server secret store, with access limited to the relevant provider project. Customer catalogue responses expose display metadata only, not credentials, private instructions or other assignments. Removing commercial project access must not remove the separate verified privacy-rights process.

## OpenAI source and migration

OpenAI's official docs currently schedule reusable prompt objects and `v1/prompts` to shut down on **30 November 2026**. They recommend moving prompt content into versioned application code and sending instructions/messages to Responses directly. See [the deprecation notice](https://developers.openai.com/api/docs/deprecations#2026-06-03-reusable-prompts) and [prompt migration guide](https://developers.openai.com/api/docs/guides/prompting/migrate-from-prompt-object).

Import/export of existing Platform prompt content therefore needs a reviewed migration, preserving the original project, prompt ID, version and content checksum as provenance. A Platform prompt ID is a source reference, not a permanent runtime dependency. Production prompt changes require approval, evaluation and a new immutable revision. Do not promise automatic synchronization or supported listing endpoints until verified against the actual account and current APIs.

## Charging and remaining decisions

For this demo, the existing customer package is shared across projects; switching project does not reset usage. Per-project allowances, separate prices/budgets and renewal behavior remain a business decision. Before live integration, confirm source projects/prompts, instruction rights, provider account/credential ownership, publication permissions, privacy configuration and how to handle changes made in Platform after import.

AK-059 tracks this prototype. AK-060–062 track production memberships/routing, portable prompt import/versioning and cross-project verification. Existing schema, private-history, usage, AI-gateway and workflow tasks also include this scope.
