# AI - Kundetypeassistent

A Danish customer-type assistant for Helle Bodeholt, using the approved option 1 layout with the client's black-and-white palette requested on 18 October 2026.

The first **persistent administrator backoffice** is in `backoffice/`: English/Danish management, a protected first Admin, invitation-only Admin/Customer accounts with required password/authenticator sign-in, customer/project records, immutable prompt versions and encrypted API connections. See [backoffice setup, boundaries and recovery](docs/backoffice.md). The original customer experience in `app/` remains an explicitly labelled synthetic demo; live AI chat, private history and billing integration are later milestones.

[Open the live demo](https://ai.igurl.dk/) · [Deployment and rollback](docs/deployment-jig.md). Use fictional information only; the demo resets on reload.

Meeting update: a customer can access several projects with a specific prompt/version in each. See [project and prompt assignments](docs/projects-and-prompts.md).

[Project roadmap](https://github.com/gunnero/AIchat/issues/1) · [Task index](planning/TASKS.md) · [Scope](planning/PROJECT.md) · [Architecture](docs/architecture.md)

## Run locally

Use Node 22.12+ or Node 24 LTS and npm. Node 20.19+ also satisfies the build tool's minimum.

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

## Data and implementation limits

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
