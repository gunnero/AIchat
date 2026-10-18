# Real backoffice

This is a separate, persistent administrator application. Keep `../app/` as the synthetic public demo and retain its production build guard.

Use Node 24.22 LTS, Fastify, and SQLite for this single-process administration service. This service now includes invitation-only Admin/Customer identity and an assigned-project customer landing page. Private chat storage, generation, usage/billing and the customer PostgreSQL ownership model remain separate milestones. Do not claim this identity foundation completes the customer runtime or GDPR compliance.

Keep the approved black/white option 1 design. All actual keys and prompt contents are server records, never fixtures. Never return API keys, password hashes, MFA secrets outside initial local owner enrollment or recipient-authorized invitation enrollment, or raw provider failures. API keys are entered by the owner through the authenticated UI; do not copy keys from chat into tools or source files.

First-owner enrollment is available only on the loopback interface, without proxy headers, before an owner exists, with same-origin checks and a short-lived setup cookie. Normal public sign-in for Admin and Customer requires password plus TOTP. Preserve the protected first Admin internally; every staff-facing role is Admin. Protect it against identity/status/role changes and deletion, including direct-ID requests. Never return the internal protection flag. Never add a default account or publicly accessible setup shortcut. Do not weaken this to automate a screenshot.

Run `npm run check`. Behavior tests must use temporary databases and synthetic secrets, and must not call OpenAI. Exercise unauthorized reads/writes, CSRF, session expiry/replay, persisted records, immutable versions, cross-project bindings, encryption and failed key rotation. Exercise invite expiry/reuse/resend/revocation, mandatory MFA enrollment, staff/customer authorization, protected-owner enforcement, schema migration and English/Danish messages. Use a fake mail adapter in tests; never send fixture mail through the real MTA. Keep secrets and DB files outside release/static directories; preserve both DB and vault master key for recovery.
