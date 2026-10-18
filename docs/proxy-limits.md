# Visitor rate limits behind Apache

Production keeps Fastify `trustProxy: false`. Only limiter identities consume a
single validated `X-Forwarded-For` address, only with `APACHE_CLIENT_IP=1`, and only
when the socket peer is the IPv4 loopback proxy. Apache must overwrite that header
from `CONN_REMOTE_ADDR`, with `ProxyAddHeaders Off`. Browser-supplied chains and
duplicate values must never become limiter identities. IPv6 and mapped IPv4
representations normalize to the same address. Invalid/missing values fall back
to the socket bucket. This trusts the existing local host boundary; it does not
authenticate other processes on that host.

Install/validate/reload the scoped Apache include **before** enabling the flag or
starting the new release. Old code with the new include remains compatible.
New code without the flag remains in direct-socket mode. Never enable the flag
behind an unsanitized proxy or a CDN without a separately reviewed trust chain.
Code recovery may retain the sanitizing include and database writes. There is no
database migration or session invalidation for this change.

Local development and the private enrollment bridge leave the flag unset. Owner
enrollment still checks the raw socket, local Host, bootstrap token and absence
of forwarding headers. Password/TOTP, CSRF, account-level persistent lockouts and
route-specific limits are unchanged. Visitors sharing a public network address
share the network limit. Limits are local to one Node process; multiple app
instances require a reviewed shared store before scaling out.

Run `node --test tests/client-address.test.mjs` and the required package check
with disposable PostgreSQL/restore databases. On the target Apache host, run
`python3 deploy/jig/test-proxy-boundary.py deploy/jig/ai-backoffice-apache.conf`
as an unprivileged site user. It starts a disposable loopback-only Apache/backend
pair and verifies forged/duplicate headers, two connection peers, both proxy
paths and public setup denial. It makes no production application, provider or
email calls.

Directive semantics: [Apache request headers](https://httpd.apache.org/docs/2.4/mod/mod_headers.html),
[connection peer variables](https://httpd.apache.org/docs/2.4/expr.html), and
[ProxyAddHeaders](https://httpd.apache.org/docs/2.4/mod/mod_proxy.html#proxyaddheaders).
