#!/bin/sh
# Certificate-specific Certbot deploy hook; never restart unrelated services.
set -eu
test "${RENEWED_LINEAGE:-}" = /etc/letsencrypt/live/ai.igurl.dk || exit 0
/usr/sbin/apachectl configtest
/usr/bin/systemctl reload apache2
