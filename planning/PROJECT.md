# AI - Kundetypeassistent

Planning baseline, 16 October 2026. Canonical task status lives in the [GitHub roadmap](https://github.com/gunnero/AIchat/issues/1) for `gunnero/AIchat`. The [local task index](TASKS.md) links to all 58 tasks.

## Agreed direction

- Individual customer accounts; payment happens through an external service.
- Helle invites customers, assigns a package and controls access and expiry.
- Customers activate their own identity. Email links are the initial sign-in direction; administrator MFA is required.
- Private chat histories belong to the customer. Normal administrators cannot read unshared chats or impersonate customers.
- Customers may explicitly share a fixed snapshot with Helle and revoke future access. Future messages remain private.
- Packages expose a simple customer allowance. Internal usage accounting records tokens and estimated provider costs separately.
- The chosen visual target is option 1: dark green sidebar, cream workspace and sage accents. Danish customer UI; English engineering tasks.
- Approved instructions and knowledge define assistant behaviour. Customer conversations are not automatically used as shared knowledge or training material.

## First reviewable build

A local, responsive implementation of option 1 with fictional accounts and a mock AI provider. A user can create a conversation, send a message, watch a simulated streamed answer, stop it, revisit history, copy text and inspect the usage and sharing flows. A mock administrator can invite, assign a plan and change access status. This is a prototype; it does not establish production security, performance or GDPR compliance.

The first implementation batch is AK-001 through AK-009. AK-010 and AK-011 can be prepared while the prototype is built. AK-012 through AK-014 form the separate, synthetic-data API pilot.

## Privacy and speed requirements

All ownership, sharing and entitlement decisions are enforced on the server and backed by appropriate database controls. The server owns the OpenAI credential. Encryption at rest and in transit does not imply end-to-end encryption or prevent every infrastructure administrator from having technical access. Provider processing and retention must be disclosed accurately.

The initial speed targets are a median of 2 seconds and p95 of 5 seconds from Send to the first readable text for standard tasks. They are planning targets, not measured results or guarantees. Complete-answer time is measured separately. Benchmark the actual model, region and privacy configuration and retain quality and cost results alongside latency.

No real customer-data pilot launches until the applicable access tests, supplier arrangements, notices, privacy procedures and deployment checks are complete.

## Decisions still open

- Instructions, knowledge files, rights to use them and approved example answers.
- Expected account count, concurrent users, typical task length and input types.
- Permitted personal/sensitive data, lawful bases, roles, retention and DPIA assessment.
- Application framework, authentication/email services, hosting and account ownership.
- OpenAI model, project access, regional processing and retention eligibility.
- Actual package prices, renewal/reset rules, rollover, top-ups, cancellations and refunds.
- Domain, operating budget, support ownership and release arrangements.

## Scope boundaries

The first release includes admin knowledge uploads. Customer document uploads are a separate optional extension with their own access, parsing and deletion work. Payment-webhook automation is also optional; manual entitlement management is sufficient for the initial external-payment flow. No team accounts, public chat sharing, voice, mobile-native application or autonomous external actions are part of this baseline.

## Existing references

- Selected design: `assets/ai-kundetypeassistent-selected-concept.png`
- Danish proposal: `output/pdf/AI-Kundetypeassistent-projektforslag-DA.pdf`
- English review: `output/pdf/AI-Kundetypeassistent-project-proposal-EN.pdf`

The proposals contain the supporting OpenAI, EDPB and OWASP references. Recheck current implementation documentation when each task starts. The first batch now has an implemented local demo in `app/`, with synthetic data and no production integrations. See the architecture, decision register and testing guide in `docs/`, plus `app/design-qa.md` for browser evidence. Production security, real AI performance and GDPR operations remain unimplemented later tasks.
