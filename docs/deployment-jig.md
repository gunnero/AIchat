# Demo deployment on jig

Deployment status on 18 October 2026: **live and verified at [https://ai.igurl.dk](https://ai.igurl.dk/)**. This is the synthetic, in-memory demo. It has no real authentication, AI requests, customer database, email delivery or billing. Do not use it for customer data.

## Verified mapping

| Item | Value |
| --- | --- |
| Requested public hostname | `ai.igurl.dk` |
| Server | `jig.123url.dk`, `46.224.27.137` |
| IPv6 | `2a01:4f8:1c19:c06c::1` |
| Web server | Apache; Virtualmin child server of `igurl.dk` |
| Release owner | `igurl` |
| Site directory | `/home/igurl/domains/ai.igurl.dk` |
| Web root | `public_html`, a symlink to `releases/43ef3614d760f238faad34351f6c61f93a54e308` |
| Application revision | `43ef3614d760f238faad34351f6c61f93a54e308`, branch `codex/foundation-prototype` |
| Apache vhost | `/etc/apache2/sites-available/ai.igurl.dk.conf` |
| Scoped static settings | `/etc/apache2/ai-demo-common.conf` |
| ACME web root | `/home/igurl/domains/ai.igurl.dk/acme` |
| Logs | `/var/log/virtualmin/ai.igurl.dk_{access,error}_log` |

Work ran from the developer's Mac using the existing verified SSH route through `web01` to `jig`. Administrative access was used for Virtualmin and Apache configuration. Release extraction, checksums, backups and activation ran as `igurl`. The frontend was built locally as the developer user. No Node process, database, mail domain or API secret is needed on the server for this demo.

The child site uses the existing parent Unix account; it is not a separate security boundary from other sites owned by that account. Production hosting and isolation decisions remain open in AK-049.

## Build and publication

Run `npm run build` from `app/`. This intentionally builds in **demo** mode. The production build guard remains in place. Upload only `app/dist/client`; the optional Sites worker is not used on jig.

The uploaded bundle also includes a generated `release.json` containing its source revision and build timestamp, plus a `robots.txt` disallowing indexing. SHA-256 checksums are stored outside the web root at `releases/<revision>.sha256`. The initial archive SHA-256 is `91835f917dad427229578f18c91b92d49ca9e6e2ad1dcf6b2eb950903d7eda9d`.

Release files are readable static assets. PHP, CGI, server-side includes, directory listing and `.htaccess` overrides are disabled for this site. CSP allows only local scripts, styles and fonts and disallows network API requests. HTML and release metadata revalidate; fingerprinted assets have immutable caching. Gzip was verified for JavaScript (305,362 bytes uncompressed; 91,528 transferred compressed). These controls support demo hosting and do not establish production security or GDPR compliance.

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

For later demo releases, create a new `releases/<full-revision>` as `igurl`, verify all checksums before activation, and atomically replace the `public_html` symlink using a temporary sibling symlink and `mv -Tf`. Retain the previous target. To roll back, atomically point `public_html` back to that retained release and verify `release.json`. Restoring the placeholder uses the same approach with `backups/public_html.initial-20261016` as the target. Do not delete or overwrite old releases during activation.

Do not change unrelated sites, parent DNS records or certificates. AK-049 remains open: this demo deployment does not complete production environment separation, backup automation or restore testing for real customer data.
