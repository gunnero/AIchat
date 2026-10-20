# Local project and retired hosting

On 20 October 2026 the owner requested complete removal of the ai.igurl.dk hosted installation while keeping the whole project current on the developer Mac. Authoritative Hetzner DNS cleanup was explicitly deferred by the owner.

## Preserved locally

- The project checkout retains application source, locked dependencies, tests, deployment/recovery scripts, designs and local proposal artifacts. All GitHub branches were fetched. The current backend source and package/lock files matched all 35 deployed source files from release `51c1ff57a6dc6491c98f021320ff9b6778dad888` before retirement.
- The real application is `backoffice/`, using Node 24.22/PostgreSQL 18/schema 9. Its production build passed during handover. The separate synthetic demo remains available at `http://127.0.0.1:4173/`. It contains fictional data and is not a restored copy of the live accounts/chats.
- A sibling private folder, `../AIchat-private-recovery/2026-10-20/`, contains a complete Git bundle with all branch history, GitHub issue/PR metadata, the encrypted server archive, encrypted site logs, checksum manifests and verification receipts. The folder is 0700 and files are 0600; it is outside the repository and static web roots.
- The server archive preserves the stopped site's application/runtime releases, demo files, fresh schema-9 database dump, matching vault and cumulative deletion journal, database-role export, stopped dedicated PostgreSQL cluster, private configuration, child Virtualmin metadata, TLS material, previous encrypted backups and project-specific deployment checkpoints. It is a recovery archive, not an image of the entire shared server.

The archive was copied to the Mac and its SHA-256 matched the server copy. Authenticated age decryption was streamed through checksum verification without writing plaintext production records into development files. The fresh database dump, vault/journal, configuration and current source files were verified before destructive server cleanup. The existing age recovery identity remains in the separate private recovery-key directory under the owner's Mac configuration; never print, commit or upload it.

## Removed from jig

The scoped application and its four scheduled jobs were disabled/stopped. The ai.igurl.dk child virtual server, project files/state, dedicated PostgreSQL 18/ai cluster, project runtime/operator accounts, project-specific backup copies/checkpoints, and dedicated TLS certificate/renewal were removed after the verified transfer. The parent igurl account, other websites, mail/DNS configuration, shared PostgreSQL installation and unrelated disk contents were retained.

A minimal Apache host-denial rule for ai.igurl.dk prevents stale DNS from serving another virtual host. This is not an application deployment. Its removal or replacement must be coordinated with any later DNS/domain reuse.

The owner chose to remove DNS records later in Hetzner. Only the `ai` A, AAAA and TXT (SPF) records and `202608._domainkey.ai` CNAME belong to this retired installation. The root domain's A/AAAA/MX, shared DKIM selector and other sites' records must remain unchanged.

## Future development and recovery

Use synthetic data and a new isolated development database/vault for local development. Do not extract the server archive over the Mac filesystem, copy live credentials into frontend code or activate the archived customer database as a demo. The archive intentionally holds sensitive material encrypted outside the project.

An authorized operator can later recover the logical dump with its matching vault and latest deletion journal in an isolated, reviewed environment, following [operations](operations.md) and [account recovery](account-recovery.md). Recreate least-privilege identities/configuration, use schema-9-compatible code, replay deletion records and invalidate restored sessions/recovery factors before serving traffic. The physical cluster snapshot is Linux recovery material; use the logical PostgreSQL dump for a different platform. A future public deployment needs fresh scope, DNS/TLS checks and the remaining privacy/AI/launch gates.

The source repository and existing GitHub PRs/issues were retained. Hosting removal is not a claim that the unfinished AI, accounting, sharing, privacy or launch tasks are complete.
