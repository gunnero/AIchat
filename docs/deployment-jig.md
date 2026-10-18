# Demo deployment on jig

Deployment status on 18 October 2026: **live and verified at [https://ai.igurl.dk](https://ai.igurl.dk/)**. This is the synthetic, in-memory demo. It has no real authentication, AI requests, customer database, email delivery or billing. Do not use it for customer data.

The separate **persistent administrator backoffice** is now live at [https://ai.igurl.dk/backoffice/](https://ai.igurl.dk/backoffice/). Its release, service boundary and verification are recorded below and in [the backoffice runbook](backoffice.md). The demo-specific statements and mapping in the original sections refer to `/`, not the new service.

## Administrator service deployment — 18 October 2026

**Current backoffice release: `ad7ba8cba1447e6bbb606b8af17448411acd19c5`.** This follow-up lets an administrator prepare prompt versions before choosing the project's first API connection. Existing configured projects still cannot silently move to another connection, and the expanded regression test verifies existing customer assignments keep v1 when v2 is created. All four CI checks passed before activation; the 18 backend tests and existing app checks remain green. Archive SHA-256 `8ee2c176248b78e6960602fcccfd8d084c6096a4e737ece98e84533ceb6d57a1`; fresh consistent pre-update database/vault backup `/var/lib/ai-kundetypeassistent/backups/before-ad7ba8c`. The code symlink and non-secret revision metadata were updated and only `ai-backoffice` was restarted. The original `fa9fbc0` release remains for rollback; schema and private state were preserved. Public endpoint checks and all 45 build-file hashes were reverified over trusted HTTPS from `web01`; no additional hosting configuration changed.

Initial installation record:

- Source: `fa9fbc03141c57cf783e4540e90727325dc09aaf`, branch `codex/admin-backoffice`, [draft PR #70](https://github.com/gunnero/AIchat/pull/70), stacked on #60. Both app/backoffice push and PR CI checks passed before activation (18 backend tests, 25 existing behavior tests, four worker tests, builds/type checks and zero runtime advisories).
- Execution: developer Mac → existing `web01` SSH relay → `jig.123url.dk`, root for scoped service/configuration work; package preparation ran as `igurl`. Runtime/state belong to the new non-login `ai-kundetype` account. No OpenAI key was copied from chat or added during deployment.
- Code: `/opt/ai-kundetypeassistent/current` → `releases/fa9fbc03141c57cf783e4540e90727325dc09aaf`. Root-owned code is read-only to the runtime. `/opt/ai-kundetypeassistent/runtime` is the isolated official Node 24.22.0 Linux x64 runtime; archive SHA-256 `cc2f601cee82d9a5a233302fe307abc600727035fd7d2c3a3571755989e95008` was checked locally and on jig.
- Application archive SHA-256: `f38151715d3a2762d08807fdab63f390c9fe750b4663455d3c537105a35b9469`; all 55 packaged source/build/metadata files were checked before activation. Dependencies were installed from the lockfile as `igurl`, with lifecycle scripts disabled.
- Service: `ai-backoffice.service`, running as `ai-kundetype`, listening only on `127.0.0.1:8765`. Private state `/var/lib/ai-kundetypeassistent` is mode 0700; database, master key and first-owner bootstrap token are mode 0600. systemd restricts filesystem writes to private state. Service warning/error log entries were empty after startup.
- Hosting: only the ai.igurl.dk HTTPS vhost gained `Include /etc/apache2/ai-backoffice.conf`. Apache configuration validation passed before a graceful reload. Certificate, DNS and unrelated site vhost checksums are unchanged. The existing root demo symlink/revision (`c112761`) and its API-denying CSP are unchanged.
- Verification: public HTTPS sign-in and health return 200 with the expected revision; customer/project/prompt/connection/audit APIs return 401 without a session. Public enrollment returns 403; loopback enrollment without its private token returns 404. Server-source/master-key URL probes return 404. `/backoffice/` has exactly one CSP header permitting same-origin API calls and no-store caching. All **45 public build files** match their release hashes through trusted HTTPS from the existing external `web01` relay. The native browser loads the public login with no console warnings/errors; [live screenshot](screenshots/backoffice-live-login.png).
- Network check boundary: the Mac's direct HTTP connections became unreliable during verification, and its IPv6 route was already unavailable. Full IPv4 HTTPS checks therefore ran from `web01`; browser HTTPS and jig-local HTTPS also passed. No DNS/firewall/SSH protection was changed to work around connectivity.
- First-owner enrollment is deliberately pending the owner entering their own password and authenticator through the private bridge. No default administrator exists. The local helper and handoff procedure are in the [backoffice runbook](backoffice.md#first-owner-handoff).

The prior static demo was freshly backed up as `/home/igurl/domains/ai.igurl.dk/backups/before-backoffice-fa9fbc0.tar.gz`, SHA-256 `c3d983bc044c775d1c7e2e4931e8fe7247756cdcbf824c8d91461503f02081de`. Pre-change vhost/config checksums are under `/root/123url-config-backups/ai-backoffice-20261018T115942Z`. The new initial private database/vault backup is `/var/lib/ai-kundetypeassistent/backups/initial-fa9fbc0`; a separate read-only integrity check passed, and the synthetic restore test also verified encrypted-record decryption.

To remove this first backoffice rollout, preserve its private state and backup, remove only the scoped backoffice include from this hostname's HTTPS vhost (or restore this site's saved vhost after checking for later changes), validate Apache, gracefully reload it, and stop/disable only `ai-backoffice`. Do not restore unrelated vhosts or replace the root demo. Once the owner starts adding real records, take a new consistent database/vault backup before any code/schema or recovery action. Offsite encrypted backup automation and full recovery rehearsals remain planned.

## Verified mapping

| Item | Value |
| --- | --- |
| Requested public hostname | `ai.igurl.dk` |
| Server | `jig.123url.dk`, `46.224.27.137` |
| IPv6 | `2a01:4f8:1c19:c06c::1` |
| Web server | Apache; Virtualmin child server of `igurl.dk` |
| Release owner | `igurl` |
| Site directory | `/home/igurl/domains/ai.igurl.dk` |
| Web root | `public_html`, a symlink to `releases/c112761797fa70f9018ec20027d358130431bf6c` |
| Application revision | `c112761797fa70f9018ec20027d358130431bf6c`, branch `codex/foundation-prototype` |
| Apache vhost | `/etc/apache2/sites-available/ai.igurl.dk.conf` |
| Scoped static settings | `/etc/apache2/ai-demo-common.conf` |
| ACME web root | `/home/igurl/domains/ai.igurl.dk/acme` |
| Logs | `/var/log/virtualmin/ai.igurl.dk_{access,error}_log` |

Work ran from the developer's Mac using the existing verified SSH route through `web01` to `jig`. Administrative access was used for Virtualmin and Apache configuration. Release extraction, checksums, backups and activation ran as `igurl`. The frontend was built locally as the developer user. No Node process, database, mail domain or API secret is needed on the server for this demo.

The child site uses the existing parent Unix account; it is not a separate security boundary from other sites owned by that account. Production hosting and isolation decisions remain open in AK-049.

## Build and publication

Run `npm run build` from `app/`. This intentionally builds in **demo** mode. The production build guard remains in place. Upload only `app/dist/client`; the optional Sites worker is not used on jig.

The uploaded bundle also includes a generated `release.json` containing its source revision and build timestamp, plus a `robots.txt` disallowing indexing. SHA-256 checksums are stored outside the web root at `releases/<revision>.sha256`. The initial archive SHA-256 is `91835f917dad427229578f18c91b92d49ca9e6e2ad1dcf6b2eb950903d7eda9d`.

On 18 October, the approved black-and-white palette was deployed from `a32f2c5` after both CI checks passed. The release archive SHA-256 is `cb3f2426d5bdee914ca02689da917b59c7d8d19e74991d25953e41bd7a91356a`. All 13 release files matched their checksums through public HTTPS after activation. The live browser rendered the monochrome UI without console warnings/errors. Application behavior and hosting configuration were unchanged.

The later project/prompt-assignment update on 18 October deployed `c112761` after both CI checks passed (25 behavior tests and four retained worker checks). Archive SHA-256: `8082c8433b948f1c3d6672b9dcc8789f445ce6bc0423ef895c5c4f2612062122`. All 13 files matched through public HTTPS, and the live browser verified the project switcher and per-customer assignment controls without console warnings/errors. No hosting configuration, DNS, credentials or service restarts were involved. Real Platform import and authenticated memberships remain AK-060–062.

For this rollout, public IPv4 checks passed. The developer Mac had no IPv6 route at verification time; jig's IPv6 address/listener and an IPv6 HTTPS health request from jig itself passed. The existing AAAA record was retained. This is a limit on the current external check, not an additional public IPv6 verification claim.

Release files are readable static assets. PHP, CGI, server-side includes, directory listing and `.htaccess` overrides are disabled for this site. CSP allows only local scripts, styles and fonts and disallows network API requests. HTML and release metadata revalidate; fingerprinted assets have immutable caching. Gzip was verified for JavaScript on the initial deployment. These controls support demo hosting and do not establish production security or GDPR compliance.

## DNS, HTTPS and renewal

Authoritative DNS is hosted by Hetzner. The user configured DNS; both records resolve to addresses verified on jig, and HTTP/HTTPS were checked over each address family:

| Type | Name | Value |
| --- | --- | --- |
| A | `ai` | `46.224.27.137` |
| AAAA | `ai` | `2a01:4f8:1c19:c06c::1` |

The Let's Encrypt certificate covers **only** `ai.igurl.dk` and currently expires on **16 January 2027**. Apache reads `/etc/letsencrypt/live/ai.igurl.dk/fullchain.pem` and `privkey.pem`. The final vhost in `deploy/jig/ai.igurl.dk.conf` is installed, with HTTP-to-HTTPS redirection, TLS 1.2/1.3, HTTP/2 and a one-day HSTS policy for this hostname only.

Certbot uses the dedicated ACME web root and the existing enabled, active `certbot.timer`. The certificate-specific deploy hook is `/usr/local/sbin/ai-kundetypeassistent-reload-apache`, maintained in `deploy/jig/reload-apache.sh`. It validates Apache before a graceful reload. The pre-existing `/etc/letsencrypt/renewal-hooks/deploy/123url-reload-services.sh` now skips **only** this certificate's exact `RENEWED_LINEAGE`; its behavior for other certificates is preserved. This prevents this demo's renewal from reloading unrelated mail/control-panel services.

Renewal was verified successfully, including deploy hooks, with:

```sh
certbot renew --cert-name ai.igurl.dk --dry-run --run-deploy-hooks --non-interactive --no-random-sleep-on-renew
```

The HTTP redirect explicitly excludes `/.well-known/acme-challenge/`, which was tested over IPv4 and IPv6. Temporary challenge-check files were removed. Certificate keys remain on the server and are not included in the repository or web root.

## Verification completed

- Clean application revision matched PR #60; both existing CI check runs passed before upload.
- The demo build succeeded; all 13 files matched local SHA-256 checksums when fetched from the server using a Host/DNS override.
- Health and release endpoints return the expected demo mode and source revision.
- A temporary ACME challenge file was reachable from the public server address and was removed after the check.
- Fingerprinted assets have immutable caching; JavaScript gzip compression works.
- `.env` requests return 403 and missing asset requests return 404.
- Apache configuration validation passed, and Apache remains active after graceful reload.
- Checksums confirm all pre-existing Apache site configuration files are unchanged.
- No unexpected application errors appeared in this site's error log; the deliberate denied-file probe produced an expected 403 log entry.
- Trusted public HTTPS works over IPv4 and IPv6; hostname/chain verification passes and HTTP redirects preserve paths and query strings.
- All 13 deployed assets also matched the release manifest over public HTTPS.
- Certificate renewal simulation and its Apache-only deploy hook succeeded; the existing renewal timer is enabled and active.
- The live browser loaded without certificate warnings. Simulated chat completion, sharing preview, navigation and the admin customer list worked; console warnings/errors were empty. See [live screenshot](screenshots/live-https.png).
- After HTTPS activation, unrelated vhost checksums still match the original baseline. Recent error-log entries are denied environment-file probes; no browser application errors were observed.

## Recovery and future releases

Fresh administrative backups are under `/root/123url-config-backups/ai.igurl.dk-20261016T202706Z`, outside Apache include directories. They include pre-creation vhost configuration/checksums, the generated child vhost, and the initial static settings. Existing sites must not be restored wholesale from this archive; restore only this site's file when necessary, validate Apache, then reload it.

HTTPS-specific backups from 18 October are under `/root/123url-config-backups/ai.igurl.dk-https-20261018T083913Z`, including the previous vhost, static settings and global renewal hook. Once HTTPS is live, application rollback should retain the valid certificate and final HTTPS vhost. The old staging vhost uses a self-signed certificate and is not an acceptable public HTTPS fallback. If the certificate-specific renewal setup is removed later, restore the original global hook only after reviewing any intervening changes.

The site's initial placeholder web root is preserved in both `backups/initial-public-html-20261016.tar.gz` and `backups/public_html.initial-20261016`. There was no existing application or database in this newly created child site.

Before the monochrome release, the previous working app was freshly backed up as `backups/before-monochrome-20261018T092148Z.tar.gz` (SHA-256 `aaf88166516019672f4ff105329ce9c1c8709ffa8bf63971097199e36869cab6`). Its previous symlink target was recorded beside the archive. Release `43ef3614d760f238faad34351f6c61f93a54e308` is also retained for immediate rollback.

Before the project-assignment release, the working monochrome app was freshly backed up as `backups/before-project-assignments-20261018T111013Z.tar.gz` (SHA-256 `d128811eb01d47e63eee30f1fdcc564ee22d952754d741a6a8757ad8bc120215`). Its symlink target was recorded beside the archive, and release `a32f2c516e4f224933c027e30bc4629797643220` remains available for rollback. Extraction, checksum validation and atomic activation ran as `igurl` through the verified Mac → web01 → jig route.

For later demo releases, create a new `releases/<full-revision>` as `igurl`, verify all checksums before activation, and atomically replace the `public_html` symlink using a temporary sibling symlink and `mv -Tf`. Retain the previous target. To roll back, atomically point `public_html` back to that retained release and verify `release.json`. Restoring the placeholder uses the same approach with `backups/public_html.initial-20261016` as the target. Do not delete or overwrite old releases during activation.

Do not change unrelated sites, parent DNS records or certificates. AK-049 remains open: this demo deployment does not complete production environment separation, backup automation or restore testing for real customer data.
