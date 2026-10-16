# Verification strategy

## First batch

The check command runs lint, strict TypeScript, Vitest behavioral tests and an explicit demo build. The test:sites command checks the retained starter worker. CI uses Node 22, npm ci, read-only repository permissions, no service credentials and fictional fixtures.

Automated scenarios cover fixed selected-message snapshots, revoked shares, metadata-only admin tables, invitation validation, streaming text preservation, cancellation, provider failure, per-conversation drafts, explicit sharing through the UI, failure/retry accounting, exhausted allowance, synthetic invitation creation and literal rendering of untrusted HTML.

These tests verify prototype behavior, not authenticated access, database isolation or real billing correctness.

## Browser review

Compare the welcome conversation with the 1487 × 1058 reference at the same viewport. Use full-page capture if the app's browser panel clips a larger emulated viewport. Check desktop, tablet and mobile, keyboard/dialog handling, streaming/stop, copy, admin screens, sharing and error/allowance states. Record findings in app/design-qa.md.

## Subsequent integration tests

Vitest's independent fixtures and typed domain functions provide a test harness. Add disposable PostgreSQL and real session adapters with the backend tasks; never substitute the in-memory role switch for authorization tests.

Use two customers and an administrator against real HTTP handlers and database roles. Cover direct-ID reads, lists, search, pagination, mutation, sharing/revocation, expiry and recovery. Test atomic reservations under concurrency, uncertain provider outcomes and worker crashes. AK-022/027/034/041/048 remain open.

## Production guard

The build:production command must fail with an explicit explanation. The regular build explicitly uses demo mode and displays a demo label. Unsupported local VITE_APP_MODE values display a configuration error. No production fallback silently routes customer prompts into mock output.
