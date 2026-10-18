# Real backoffice

This is a separate, persistent administrator application. Keep `../app/` as the synthetic public demo and retain its production build guard.

Use Node 24.22 LTS, Fastify, and SQLite for this single-process administration service. The customer runtime and its PostgreSQL ownership policies remain a separate milestone. Do not claim this administrator service implements customer authentication, private chat storage, billing or GDPR compliance.

Keep the approved black/white option 1 design. All actual keys and prompt contents are server records, never fixtures. Never return API keys, password hashes, MFA secrets outside initial local enrollment, or raw provider failures. API keys are entered by the owner through the authenticated UI; do not copy keys from chat into tools or source files.

First-owner enrollment is available only on the loopback interface, without proxy headers, before an owner exists, with same-origin checks and a short-lived setup cookie. Normal public sign-in requires password plus TOTP. Never add a default account or publicly accessible setup shortcut. Do not weaken this to automate a screenshot.

Run `npm run check`. Behavior tests must use temporary databases and synthetic secrets, and must not call OpenAI. Exercise unauthorized reads/writes, CSRF, session expiry/replay, persisted records, immutable versions, cross-project bindings, encryption and failed key rotation. Keep secrets and DB files outside release/static directories; preserve both DB and vault master key for recovery.
