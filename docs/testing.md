# Verification strategy

## First batch

The check command runs lint, strict TypeScript, Vitest behavioral tests and an explicit demo build. The test:sites command checks the retained starter worker. CI uses Node 22, npm ci, read-only repository permissions, no service credentials and fictional fixtures.

Automated scenarios cover fixed selected-message snapshots, revoked shares, metadata-only admin tables, invitation validation, streaming text preservation, cancellation, provider failure, per-conversation drafts, explicit sharing through the UI, failure/retry accounting, exhausted allowance, synthetic invitation creation and literal rendering of untrusted HTML.

These tests verify prototype behavior, not authenticated access, database isolation or real billing correctness.

The project/prompt update brings the behavior suite to 25 tests. It adds multiple assignments with different prompts per customer, owner/project history filters, invalid cross-project/version references, paused/ambiguous grants, immutable conversation bindings, explicit share provenance, project switching/draft preservation, prompt-specific prepared replies, reassignment, zero access/regrant, catalogue creation and new-version publication without silent reassignment.

## Browser review

Compare the welcome conversation with the 1487 × 1058 reference at the same viewport. Use full-page capture if the app's browser panel clips a larger emulated viewport. Check desktop, tablet and mobile, keyboard/dialog handling, streaming/stop, copy, admin screens, sharing and error/allowance states. Record findings in app/design-qa.md.

## Subsequent integration tests

Vitest's independent fixtures and typed domain functions provide a test harness. Add disposable PostgreSQL and real session adapters with the backend tasks; never substitute the in-memory role switch for authorization tests.

Use two customers and an administrator against real HTTP handlers and database roles. Cover direct-ID reads, lists, search, pagination, mutation, sharing/revocation, expiry and recovery. Test atomic reservations under concurrency, uncertain provider outcomes and worker crashes. AK-022/027/034/041/048 remain open.

AK-060–062 add server-enforced project memberships, portable prompt source import and adversarial cross-project verification, including revocation during streaming and usage attribution. Customer/project privacy must be verified independently of the demo role switch and client-side filters.

## Production guard

The build:production command must fail with an explicit explanation. The regular build explicitly uses demo mode and displays a demo label. Unsupported local VITE_APP_MODE values display a configuration error. No production fallback silently routes customer prompts into mock output.
# Persistent backoffice checks — 18 October 2026

`backoffice/` has 19 server behavior tests on Node 24.22.0, with isolated SQLite databases and synthetic credentials. Coverage includes unauthenticated reads/writes, protected owner enrollment and bootstrap secret, CSRF/origin enforcement, password/TOTP replay, failed-login limits, session expiry/logout, password-change revocation, persistence after reopening the database, encryption/masked metadata, failed/successful/stale key rotation, fresh MFA, pause, cross-project assignment rollback, immutable prompt versions, authenticated encryption context, logout during a pending credential change, backup restore, provider-probe boundaries and a pending-login/password-change race. TypeScript/build and a runtime dependency advisory check also pass.

Browser QA exercised actual server routes on a local synthetic instance: sign-in, connection save with fake provider, project connection, prompt version creation and customer assignment. Desktop 1440×1000 and mobile 390×844 were inspected; mobile document width stayed 390px and its edit dialog fit within 352px. Local browser console warnings/errors were empty. Screenshots show local fictional records, never production credentials: [overview](screenshots/backoffice-overview.png), [connections](screenshots/backoffice-connections.png), [mobile](screenshots/backoffice-mobile.png).

The original app's 25 behavior tests and four worker checks remain passing. No test makes a live OpenAI request or measures genuine AI speed. The first owner's real credential enrollment and live provider-key check are owner actions after deployment. Customer identity, chat isolation, usage concurrency and the broader launch/security suite remain later roadmap work.
