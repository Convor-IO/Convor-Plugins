#!/usr/bin/env bash
# (Re)configure the Convor widget on the running OpenCart container and
# verify the snippet renders. Idempotent — safe to run after `docker compose
# up -d` completes, or to change the org_slug / api_base later.
#
# The entrypoint.sh already writes these on first boot; this script exposes
# them as a standalone re-config step (mirrors the wordpress/activate.sh).
set -euo pipefail
cd "$(dirname "$0")"

SLUG="${CONVOR_ORG_SLUG:-test-org}"
API_BASE="${CONVOR_API_BASE:-http://localhost:5173}"

# Write the three module settings + ensure the storefront event is registered,
# via direct SQL against the OpenCart oc_setting / oc_event tables.
docker compose exec -T db mariadb -uopencart -popencart opencart <<SQL
-- Module settings (code = module_convor_widget).
DELETE FROM oc_setting WHERE code = 'module_convor_widget';
INSERT INTO oc_setting (store_id, code, \`key\`, value, serialized) VALUES
  (0, 'module_convor_widget', 'module_convor_widget_status',   '1',           0),
  (0, 'module_convor_widget', 'module_convor_widget_org_slug', '${SLUG}',     0),
  (0, 'module_convor_widget', 'module_convor_widget_api_base', '${API_BASE}', 0);

-- Storefront header event (idempotent — mirrors opencart/install.php).
DELETE FROM oc_event WHERE code = 'convor_widget';
INSERT INTO oc_event (code, description, \`trigger\`, action, status, sort_order) VALUES
  ('convor_widget', 'Convor widget header inject', 'catalog/view/common/header/after', 'module/convor.injectScript', 1, 1);
SQL

echo "✓ Convor OpenCart module configured (status=1, org_slug=${SLUG}, api_base=${API_BASE})"
echo "  Verify: curl -s http://localhost:8084/ | grep widget.js"
