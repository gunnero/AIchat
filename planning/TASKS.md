# AI - Kundetypeassistent — task index

[Live GitHub roadmap](https://github.com/gunnero/AIchat/issues/1) · [Milestones](https://github.com/gunnero/AIchat/milestones)

This file is a link index. GitHub Issues is the source of truth for current status. The first batch (AK-001–AK-009) is implemented and ready for review in [PR #60](https://github.com/gunnero/AIchat/pull/60). GitHub issues remain open until the implementation is merged. Later milestones are still planned.

First build batch: AK-001–AK-009. Prepare AK-010–AK-011 alongside it, then measure the synthetic-data AI pilot in AK-012–AK-014. Privacy and supplier decisions begin as soon as their inputs are available.

See [project baseline](PROJECT.md) and [structured backlog](backlog.json).

## 01 - Foundation

Record the scope and architecture; prepare a local development foundation.

| Task | Priority | Dependencies |
| --- | --- | --- |
| [AK-001 — Document the agreed scope and open decisions](https://github.com/gunnero/AIchat/issues/2) | P0 | None |
| [AK-002 — Choose and record the application architecture](https://github.com/gunnero/AIchat/issues/3) | P0 | AK-001 |
| [AK-003 — Scaffold the local application and environment setup](https://github.com/gunnero/AIchat/issues/4) | P0 | AK-002 |
| [AK-004 — Define the option 1 design system](https://github.com/gunnero/AIchat/issues/5) | P1 | AK-001 |
| [AK-005 — Create synthetic demo data and a mock AI provider](https://github.com/gunnero/AIchat/issues/6) | P1 | AK-001 |
| [AK-006 — Set up development checks and continuous integration](https://github.com/gunnero/AIchat/issues/7) | P0 | AK-003 |

## 02 - Prototype and AI pilot

Review option 1 as an interactive prototype and measure answer quality, speed and cost.

| Task | Priority | Dependencies |
| --- | --- | --- |
| [AK-007 — Build the customer workspace from option 1](https://github.com/gunnero/AIchat/issues/8) | P1 | AK-003, AK-004 |
| [AK-008 — Implement the chat interaction prototype](https://github.com/gunnero/AIchat/issues/9) | P1 | AK-005, AK-007 |
| [AK-009 — Prototype administration, sharing and usage screens](https://github.com/gunnero/AIchat/issues/10) | P1 | AK-005, AK-007 |
| [AK-010 — Provision a dedicated OpenAI development project securely](https://github.com/gunnero/AIchat/issues/11) | P0 | AK-002 |
| [AK-011 — Collect assistant materials and an answer-quality test set](https://github.com/gunnero/AIchat/issues/12) | P0 | AK-001 |
| [AK-012 — Build a minimal server-side streaming API pilot](https://github.com/gunnero/AIchat/issues/13) | P0 | AK-003, AK-010 |
| [AK-013 — Prototype retrieval from approved knowledge](https://github.com/gunnero/AIchat/issues/14) | P0 | AK-011, AK-012 |
| [AK-014 — Benchmark quality, speed and operating cost](https://github.com/gunnero/AIchat/issues/15) | P0 | AK-012, AK-013 |

## 03 - Accounts and access

Provide invitation-based accounts and enforce customer and administrator permissions.

| Task | Priority | Dependencies |
| --- | --- | --- |
| [AK-015 — Design the database schema and migrations](https://github.com/gunnero/AIchat/issues/16) | P0 | AK-002, AK-003 |
| [AK-016 — Implement customer and administrator access policies](https://github.com/gunnero/AIchat/issues/17) | P0 | AK-015 |
| [AK-017 — Integrate authentication and revocable sessions](https://github.com/gunnero/AIchat/issues/18) | P0 | AK-002, AK-015 |
| [AK-018 — Implement invitations and transactional email delivery](https://github.com/gunnero/AIchat/issues/19) | P0 | AK-016, AK-017 |
| [AK-019 — Build activation, sign-in and account recovery screens](https://github.com/gunnero/AIchat/issues/20) | P1 | AK-004, AK-018 |
| [AK-020 — Build administrator customer management](https://github.com/gunnero/AIchat/issues/21) | P0 | AK-009, AK-016, AK-019 |
| [AK-021 — Require administrator MFA and secure recovery](https://github.com/gunnero/AIchat/issues/22) | P0 | AK-017 |
| [AK-022 — Verify authentication and authorization boundaries](https://github.com/gunnero/AIchat/issues/23) | P0 | AK-016, AK-018, AK-020, AK-021 |

## 04 - Private chats and sharing

Persist private history and support explicit, revocable sharing with Helle.

| Task | Priority | Dependencies |
| --- | --- | --- |
| [AK-023 — Implement the private conversation data layer](https://github.com/gunnero/AIchat/issues/24) | P0 | AK-016, AK-017 |
| [AK-024 — Connect the customer UI to persistent private history](https://github.com/gunnero/AIchat/issues/25) | P1 | AK-008, AK-023 |
| [AK-025 — Implement explicit shared conversation snapshots](https://github.com/gunnero/AIchat/issues/26) | P0 | AK-017, AK-023 |
| [AK-026 — Build share preview, revoke and shared-inbox screens](https://github.com/gunnero/AIchat/issues/27) | P1 | AK-024, AK-025 |
| [AK-027 — Verify chat isolation and sharing lifecycle](https://github.com/gunnero/AIchat/issues/28) | P0 | AK-022, AK-024, AK-026 |

## 05 - Packages and usage

Implement customer allowances, cost accounting and enforceable limits.

| Task | Priority | Dependencies |
| --- | --- | --- |
| [AK-028 — Define package, allowance and charging rules](https://github.com/gunnero/AIchat/issues/29) | P0 | AK-001, AK-014 |
| [AK-029 — Implement the usage ledger and atomic reservations](https://github.com/gunnero/AIchat/issues/30) | P0 | AK-015, AK-028 |
| [AK-030 — Record token usage and reconcile provider cost](https://github.com/gunnero/AIchat/issues/31) | P0 | AK-012, AK-029 |
| [AK-031 — Build package administration and manual entitlements](https://github.com/gunnero/AIchat/issues/32) | P1 | AK-009, AK-020, AK-028, AK-029 |
| [AK-032 — Build customer and administrator usage views](https://github.com/gunnero/AIchat/issues/33) | P1 | AK-024, AK-029, AK-030 |
| [AK-033 — Enforce per-user rate, concurrency and spending limits](https://github.com/gunnero/AIchat/issues/34) | P0 | AK-029, AK-030 |
| [AK-034 — Verify billing and allowance correctness under concurrency](https://github.com/gunnero/AIchat/issues/35) | P0 | AK-029, AK-030, AK-031, AK-033 |

## 06 - Production AI integration

Connect the authenticated product to governed knowledge and reliable AI responses.

| Task | Priority | Dependencies |
| --- | --- | --- |
| [AK-035 — Implement the authenticated production AI gateway](https://github.com/gunnero/AIchat/issues/36) | P0 | AK-012, AK-022, AK-023, AK-029, AK-033 |
| [AK-036 — Implement administrator knowledge ingestion and publication](https://github.com/gunnero/AIchat/issues/37) | P0 | AK-011, AK-013, AK-020 |
| [AK-037 — Implement bounded conversation context and safe retrieval](https://github.com/gunnero/AIchat/issues/38) | P0 | AK-035, AK-036 |
| [AK-038 — Version assistant instructions and evaluate changes](https://github.com/gunnero/AIchat/issues/39) | P1 | AK-011, AK-014, AK-036 |
| [AK-039 — Integrate reliable streaming, cancellation and recovery](https://github.com/gunnero/AIchat/issues/40) | P0 | AK-024, AK-030, AK-035 |
| [AK-040 — Secure AI output rendering and browser interactions](https://github.com/gunnero/AIchat/issues/41) | P0 | AK-024, AK-035 |
| [AK-041 — Verify the complete assistant workflow](https://github.com/gunnero/AIchat/issues/42) | P0 | AK-034, AK-037, AK-038, AK-039, AK-040 |

## 07 - Privacy and data lifecycle

Implement privacy operations and document the necessary legal and supplier arrangements.

| Task | Priority | Dependencies |
| --- | --- | --- |
| [AK-042 — Map personal data, purposes and retention rules](https://github.com/gunnero/AIchat/issues/43) | P0 | AK-001, AK-002, AK-015 |
| [AK-043 — Implement customer export and access-request handling](https://github.com/gunnero/AIchat/issues/44) | P0 | AK-023, AK-025, AK-030, AK-042 |
| [AK-044 — Implement deletion and retention jobs across data stores](https://github.com/gunnero/AIchat/issues/45) | P0 | AK-023, AK-025, AK-029, AK-036, AK-042 |
| [AK-045 — Add content-free audit logs and privacy-safe telemetry](https://github.com/gunnero/AIchat/issues/46) | P0 | AK-020, AK-025, AK-035, AK-042 |
| [AK-046 — Prepare privacy notices, terms and customer rights flows](https://github.com/gunnero/AIchat/issues/47) | P0 | AK-042 |
| [AK-047 — Confirm supplier agreements, regions and transfer safeguards](https://github.com/gunnero/AIchat/issues/48) | P0 | AK-002, AK-010, AK-042 |
| [AK-048 — Verify privacy rights and deletion end to end](https://github.com/gunnero/AIchat/issues/49) | P0 | AK-043, AK-044, AK-045, AK-046 |

## 08 - Verification and launch

Verify security and performance, run a private pilot and prepare operations.

| Task | Priority | Dependencies |
| --- | --- | --- |
| [AK-049 — Set up staging, production and recoverable backups](https://github.com/gunnero/AIchat/issues/50) | P0 | AK-002, AK-006, AK-047 |
| [AK-050 — Configure operational metrics, alerts and incident handling](https://github.com/gunnero/AIchat/issues/51) | P0 | AK-045, AK-049 |
| [AK-051 — Run security review and targeted penetration testing](https://github.com/gunnero/AIchat/issues/52) | P0 | AK-022, AK-027, AK-034, AK-041, AK-048, AK-049 |
| [AK-052 — Validate production-like load and cost targets](https://github.com/gunnero/AIchat/issues/53) | P0 | AK-041, AK-049, AK-050 |
| [AK-053 — Run the limited invited-customer pilot](https://github.com/gunnero/AIchat/issues/54) | P0 | AK-046, AK-047, AK-048, AK-051, AK-052 |
| [AK-054 — Resolve pilot findings and confirm package economics](https://github.com/gunnero/AIchat/issues/55) | P0 | AK-053 |
| [AK-055 — Complete the operating runbook and handover](https://github.com/gunnero/AIchat/issues/56) | P0 | AK-049, AK-050, AK-054 |
| [AK-056 — Confirm launch readiness and release the service](https://github.com/gunnero/AIchat/issues/57) | P0 | AK-047, AK-051, AK-052, AK-054, AK-055 |

## Later - Optional extensions

Optional work outside the first release; schedule only if needed.

| Task | Priority | Dependencies |
| --- | --- | --- |
| [AK-057 — Add private customer document uploads if required](https://github.com/gunnero/AIchat/issues/58) | P2 | AK-056 |
| [AK-058 — Automate entitlements from the external payment system](https://github.com/gunnero/AIchat/issues/59) | P2 | AK-056 |
