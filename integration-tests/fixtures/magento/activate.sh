#!/usr/bin/env bash
# (Re)configure the Convor_Widget module on the running Magento container
# and verify the snippet renders. Idempotent — safe to run after
# `docker compose up -d` completes, or to change the org_slug / api_base.
#
# The entrypoint.sh already writes these on first boot; this script exposes
# them as a standalone re-config step (mirrors wordpress/activate.sh). Uses
# direct core_config_data inserts as a fallback when config:set can't yet
# see the freshly-declared system.xml paths.
set -euo pipefail
cd "$(dirname "$0")"

SLUG="${CONVOR_ORG_SLUG:-test-org}"
API_BASE="${CONVOR_API_BASE:-http://localhost:5173}"
MAGE="runuser -u www-data -- php /var/www/html/bin/magento"

# Ensure the module is enabled + upgraded (no-op if already done).
docker compose exec -T magento sh -c "$MAGE module:enable Convor_Widget && $MAGE setup:upgrade" >/dev/null 2>&1 || true

# Write the three config values. config:set validates the path against the
# merged system.xml; right after enabling a module that cache may be stale,
# so fall back to a direct core_config_data insert per path.
write_cfg() {
  local path="$1" val="$2"
  docker compose exec -T magento sh -c "$MAGE config:set ${path} '${val}'" 2>/dev/null || \
    docker compose exec -T db mariadb -umagento -pmagento magento -e \
      "DELETE FROM core_config_data WHERE path='${path}';
       INSERT INTO core_config_data (scope, scope_id, path, value) VALUES ('default', 0, '${path}', '${val}');" \
      2>/dev/null
}
write_cfg convor_widget/general/enabled 1
write_cfg convor_widget/general/org_slug "${SLUG}"
write_cfg convor_widget/general/api_base "${API_BASE}"

docker compose exec -T magento sh -c "$MAGE cache:flush" >/dev/null 2>&1 || true

echo "✓ Convor_Widget module configured (enabled=1, org_slug=${SLUG}, api_base=${API_BASE})"
echo "  Verify: curl -s http://localhost:8085/ | grep widget.js"
