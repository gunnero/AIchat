# Secure account recovery

Customers and Admins use the same English/Danish recovery flow. The protected first Admin uses the same screens and remains labelled **Admin**. Recovery preserves account identity, assignments, encrypted private history and the vault key. It does not reactivate a paused account, change its access/allowance or grant administrators another person's private chats.

## User journeys

- **Forgotten password, authenticator available:** choose “Forgot password or lost authenticator?” on either sign-in screen, enter the registered email, open the personal link, choose a new password and prove possession of the existing authenticator with a fresh code. Passwords require at least 14 characters. The authenticator stays unchanged.
- **Lost authenticator:** open the email recovery link, select the lost-authenticator option and enter the existing password plus one saved recovery code. Scan the clearly labelled replacement QR, choose a new password and confirm with the new authenticator. Save the ten newly issued codes. The old authenticator is changed only after confirmation.
- **Existing accounts:** open My account → Recovery codes, enter the current password and a fresh authenticator code, then save the codes in a password manager or another safe place separate from the phone. Codes appear only once. Generating a new set invalidates the previous set and any pending recovery flow.
- **New invitations/initial owner setup:** save recovery codes immediately after mandatory authenticator enrollment. Continue only after acknowledging they have been saved. No default or public owner setup shortcut is added.

Email alone cannot replace MFA. A successful recovery ends every previous sign-in, clears unfinished registration/recovery grants and requires normal password-plus-authenticator sign-in. A secret-free security notice is queued to the registered email. Paused, missing and eligible account requests receive the same public response.

## Verified assistance when all factors are lost

There is no Admin dashboard password/MFA reset or impersonation action. Losing both the authenticator and codes (or forgetting the password while the phone is also lost) requires an independently verified human support process. Possession of the recovery email, a chat message, billing details alone or a staff member's assertion is insufficient.

1. The designated maintenance operator records a case UUID and verifies the person using a previously established independent channel. Use a live callback to a number recorded **before** the incident, or a prearranged in-person identity check. For an Admin, obtain an independent authorized business contact's confirmation; for the protected owner use the prearranged owner identity/key-custody contact. Do not accept a new number or recovery destination supplied in the request. If no independent proof was established, keep the account locked until an accountable identity-verification process is agreed; never invent a bypass.
2. Record verification method, verifier, time and approval in the restricted support case system. Do not store identity documents, recovery factors or private conversation content in GitHub or application audit logs. The operator checks current enrollment and active status and confirms the recovery email is unchanged.
3. As the existing **ai-migrate / ai_migrator** maintenance identity, use the reviewed release's `server/recovery-support.mjs` CLI with the registered email, verified-case UUID and a new private output path. The parent directory must be operator-owned 0700, and the new file is 0600. Do not run this through the public service identity or expose its output in terminal captures. The CLI refuses a runtime connection and cannot overwrite an existing output file.
4. Deliver the one-use support authorization through the **separately verified channel**, not the recovery email. It expires after ten minutes. The recipient independently requests their email link, selects the personal support code option, then sets a new password and authenticator and saves new codes. Delete the private handover file once delivered/expired. If abandoned, issue a new authorization only after rechecking the case. Existing passwords/MFA remain valid until completion.
5. Confirm the user's normal sign-in and security notification without asking for passwords, authenticator secrets or recovery codes. The account keeps its original role/identity and private data. The operator does not sign in as the user.

Operational readiness requires naming the support operator and establishing independent verification channels **before** users lose all factors. The application does not automate identity verification or claim an emergency backdoor.

## Security and storage

PostgreSQL schema 9 adds hashed one-use recovery codes, hashed email tokens, restricted recovery sessions, persistent per-account proof limits and operator-issued support authorizations. Only encrypted replacement MFA seeds are retained during enrollment. No plaintext passwords, links or codes enter audit/operational logs. UI secrets remain in memory, are removed on close/navigation, and are never stored in browser storage. Email tokens use the URL fragment, which is immediately removed and is not sent in HTTP paths/referrers. There are no third-party QR services.

Email links expire in 30 minutes. A restricted cookie expires within ten minutes and cannot access account, customer or Admin APIs. It is Secure, HttpOnly, SameSite=Strict, root-scoped with a `__Host-` name on HTTPS. Changes require same-origin JSON and a CSRF proof tied to that cookie. Password/code checks are bounded by persistent per-account limits and route limits; failures do not lock normal sign-in. Credential changes, suspension, rotation and completion invalidate stale grants. Concurrent completions serialize and consume factors atomically.

Mail uses the existing pinned local STARTTLS adapter. Request responses do not wait for SMTP; an unsent/failed email never enables a token. Delivery is best effort, not a durable delivery queue. Retry after the cooldown if mail is delayed; an email accepted by SMTP is not proof it reached an inbox. Automatic tests use fake delivery and synthetic identities only.

Runtime `ai_control` can consume support grants but **cannot insert/update them**; `ai_chat` cannot access recovery tables. Only the maintenance identity can issue a support authorization. Neither runtime role owns tables or bypasses chat policies. All displayed staff roles remain Admin.

## Deployment and restore

The additive schema 8→9 upgrade preserves credentials, existing sessions, MFA replay counters, owner protection, invitations, assignments and private history. Back up the database, matching vault and current deletion journal before migration. After schema 9 accepts writes, use schema-9-compatible code and forward repair; never rewind PostgreSQL to an older snapshot.

A schema-9 backup restore deliberately removes **all recovery codes and pending email/support/restricted-session grants**, as well as existing login sessions. This prevents a backup from resurrecting a factor consumed after the snapshot. Users retain their enrolled password/authenticator and must generate fresh recovery codes after restoration. If their authenticator is also unavailable, use verified operator assistance. The synthetic weekly encrypted restore drill verifies this rule, MFA preservation, protected owner and deletion replay. Older schema backups must be upgraded to schema 9 offline before serving traffic.

See [operations](operations.md) for encrypted storage, deletion reconciliation and recovery-key custody. Attached-volume backup, independent off-server copies and whole-host outage monitoring remain separate requirements.

References: [OWASP password recovery](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [OWASP multifactor authentication](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html).
