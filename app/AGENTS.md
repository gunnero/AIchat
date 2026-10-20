# Prototype Instructions

Hosting status (20 October 2026): the owner requested removal of the ai.igurl.dk installation, with the complete project preserved on the Mac. Keep work local and retain the synthetic demo; do not automatically redeploy to the retired hostname. See `../docs/local-only-handoff.md`. Production accounts/chats remain only in a separate encrypted recovery archive and must never become demo data.

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Approved design update — 18 October 2026

The client approved the project and requested a black-and-white palette. This supersedes the green/cream/sage colors in the original option 1 image. Keep the approved layout, typography and interactions. Use black, white and neutral grays throughout customer/admin screens, dialogs, status/feedback and focus states. Display the supplied logo in grayscale without replacing the original asset. Preserve readable contrast and explicit status labels.

## Project and prompt assignments — 18 October 2026

Customers can have multiple assigned projects and one specific prompt version per project. Assignments are administered in this app; Platform-created configuration is the intended source for a later server-side import/integration. Customers choose only among their assigned projects. Histories remain private per customer/project, and new chats pin their assigned prompt version. Preserve the monochrome layout. Catalogue names such as green/yellow do not change the theme. This batch remains a synthetic demo; never embed live prompts, credentials or customer data in the frontend. See `../docs/projects-and-prompts.md` for the provider migration constraint and production boundaries.
