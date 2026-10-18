# Mobile and loading follow-up — 18 October 2026

Delivery continues in draft PR #72. The separate visitor-limit repair was
deployed first at `01a27bb4455fd4b3967376aa1c0f02cbc02d84e1`.

## Interface

Administration uses a compact, labelled menu at widths up to 1000px, with all
seven destinations, language selection, account settings and sign-out. A native
dialog handles keyboard containment, Escape and focus restoration. Desktop keeps
the permanent sidebar. The administration/customer visual distinction remains.

Usage tables retain their table semantics and column headings, with labelled
stacked cells on phones up to 650px. Allowance, tokens and money no longer need
horizontal scrolling. Unknown/unmeasured amounts remain explicitly unavailable.
No reporting reads or real credentials are needed for layout verification.

## Loading

The customer startup path excludes administration, reporting, account settings,
invitation enrollment and QR provisioning code. These load on demand. A loading
state and reload recovery cover unavailable build chunks. Private component
state is still discarded on logout, session expiry and navigation; drafts and
chat data are not added to browser storage.

Compared with revision `39fb3b8`, entry JavaScript falls from about **418.32 kB /
125.95 kB gzip** to **313.19 kB / 96.80 kB gzip** (25% / 23% reductions).
Initial CSS falls from **40.42 kB / 8.12 kB gzip** to **28.32 kB / 6.23 kB gzip**.
Latin fonts retain English and Danish characters. Build-time checks prevent
optional screens entering the initial dependency graph and enforce 330 kB /
102 kB gzip ceilings before final Vite preload rewriting.

Only successful, content-hashed JS/CSS/font build URLs under
`/backoffice/assets/` receive immutable public cache headers, including 304
revalidation. HTML, APIs, private data, unversioned files and missing assets
remain `no-store`. No service worker or private-data cache is introduced.
Deploy the matching scoped Apache include as well as the application build.

## Verification and remaining work

Required package checks use fake mail/providers and disposable PostgreSQL 18
databases. Regression coverage includes both menu languages, every destination,
selection/Escape/focus restoration, private-state clearing and public-asset
versus private-response cache rules. A disposable target-Apache rehearsal checks
header sanitization and public-cache/error behavior without production traffic.

Synthetic browser review covers 390px phone, 768px tablet and 1440px desktop;
the original audit's screenshots remain the baseline. Reload recovery was also
exercised when an earlier build's optional chunk became unavailable.

Track completion and remaining device checks in #73 and loading work in #74.
Physical iPhone/Android/tablet checks, assistive technology, zoom and slow-network
field measurements remain pilot requirements. Bundle size is not a promise of
AI response time. Large-history search and concurrency/load work remain in #53.
Recovery, offsite backups, monitoring, delivery and privacy release tasks remain
open. This batch makes no AI calls and does not implement the agent migration.
