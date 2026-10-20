# AI - Kundetypeassistent

An invitation-only English/Danish customer workspace and administrator backoffice for Helle Bodeholt.

**Local-only status — 20 October 2026:** the owner requested removal of the hosted installation at ai.igurl.dk. The latest application source remains here on the Mac, based on recovery release `51c1ff57a6dc6491c98f021320ff9b6778dad888`. A verified encrypted copy of the retired server is stored separately from this repository. DNS removal is deferred by the owner. See the [local handover and recovery record](docs/local-only-handoff.md). Earlier deployment documents describe historical installations.

- **Customer workspace** (`/` in the real application): persistent private project histories and saved messages, project themes, personal profile and allowance. Live AI replies, sharing and paid-token accounting remain disabled.
- **Administration** (`/backoffice/` in the real application): invitation-only accounts with mandatory password/TOTP sign-in, project/prompt assignments, encrypted project/reporting credentials and usage-report connection. Staff have access only to their own assigned workspace, never other users' unshared chats.
- [Local synthetic demonstration](http://127.0.0.1:4173/): fictional in-memory interaction examples. It resets on reload and sends no real email or AI requests. This demo is separate from the complete real application in `backoffice/`.

The real application is in `backoffice/`: React/TypeScript UI, JavaScript/Fastify API, Node **24.22**, PostgreSQL **18**, schema **9**, separate non-owner control/chat roles and forced row policies. SQLite exists only for legacy fixtures and one-time verified import; production never falls back to it. The original demonstration remains in `app/` with its production-build guard.

Follow the [current workspace and PostgreSQL recovery instructions](docs/customer-workspace.md), [automated backups/monitoring runbook](docs/operations.md) and [deployment history](docs/customer-workspace-deployment.md). Automated encrypted copies on the attached server disk do not establish off-server disaster recovery or wider GDPR readiness.

[Project roadmap](https://github.com/gunnero/AIchat/issues/1) · [Task index](planning/TASKS.md) · [Scope](planning/PROJECT.md) · [Architecture](docs/architecture.md)

## Develop the real application

Use Node 24.22 and PostgreSQL 18. `backoffice/server/start.mjs` requires the private vault and both PostgreSQL role connections documented in [the current runbook](docs/customer-workspace.md). Never point a developer instance at production customer data or use CI fixture credentials on a server. Do not follow historical SQLite production startup/recovery instructions in older documents.

`npm --prefix backoffice ci --ignore-scripts` installs locked dependencies. `npm --prefix backoffice run check` runs backend/UI tests and builds the application; PostgreSQL integration tests require both disposable test databases and matching version-18 clients. CI provisions these and also runs operational encryption tests and a synthetic restore rehearsal. Operational Python tests require `age` and `age-keygen`: `python3 -m unittest discover -s backoffice/tests -p '*_test.py'`. Tests use fake email/providers and no OpenAI calls.

## Run the synthetic demo locally

Use Node **24.22.0** and npm for the current supported workspace. The commands below run the synthetic demo only.

```sh
cd app
npm ci
npm run dev -- --host 127.0.0.1 --port 4173 --strictPort
```

Open http://127.0.0.1:4173/. No environment file, API key, database or email account is needed. Optional public configuration is documented in app/.env.example. The static /health.json endpoint identifies this as a demo; it does not check external services.

## Review the prototype

- Start from the welcome-email conversation or choose **Ny samtale**.
- Use **Dit projekt** to switch between assigned projects; each has its own history and assigned prompt. The package allowance is shared across projects in this demo.
- Write a fictional message, send it, stop a streamed response, revisit history or copy an answer.
- Open **Del med Helle**, select messages and confirm a fixed copy. Reopen the dialog to revoke it.
- Open **Sofie Jensen → Administration (demo)** for invitations, package assignment, account pause/expiry, illustrative package editing and a shared-content inbox.
- Under **Kunder → Administrér**, assign several projects and choose one prompt/version per project. **Projekter og prompter** manages the fictional catalogue and new versions. Real Platform import is a later server task.
- Open **Demoindstillinger** from the profile menu for delayed replies, simulated errors, exhausted allowance or a reset.
- Click the allowance bar to inspect the demo package.

Only complete replies consume a demo answer; cancellation/failure does not. This is a prototype interaction rule, not final commercial billing policy. The demo clock is fixed to 16 October 2026 so expiry examples remain reproducible.

## Synthetic demo limits

Customers use fictional example.test addresses. State exists only in memory and resets on reload. No OpenAI requests, emails, analytics or payments are sent; fonts and icons are served locally. Use fictional information only.

The customer/admin switch is for reviewing designs. There is no authentication or secure multi-user backend yet. Frontend separation is not an authorization boundary. This is not a production service or evidence of GDPR compliance.

The build command explicitly creates a labelled demo. The build:production command intentionally fails until production services and controls are implemented. Do not remove the guard simply to deploy this as a customer service.

## Checks

```sh
cd app
npm run check       # lint, TypeScript, behavioral tests, demo build
npm run test:sites  # retained starter worker checks
npm audit          # dependency advisory snapshot
```

CI uses locked dependencies and no secrets. See [testing](docs/testing.md), [design system](docs/design-system.md), and [browser design QA](app/design-qa.md).

The original design is in assets/. Proposal PDFs and generators remain local and are excluded from Git.
