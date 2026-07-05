#!/usr/bin/env bash
# Bootstrap a real PrestaShop 8 install (auto-runs on first boot via env),
# install the Convor module, register its displayHeader hook, and configure
# it so the widget snippet renders on the storefront.
#
# Run AFTER `docker compose up -d`. Idempotent.
#
#   ./install.sh && curl -s http://localhost:8082/ | grep widget.js
set -euo pipefail
cd "$(dirname "$0")"

API_BASE="${WIDGET_API_BASE:-http://localhost:5173}"
ORG_SLUG="${CONVOR_ORG_SLUG:-test-org}"
CMS="docker compose exec -T prestashop"
DB="docker compose exec -T db mysql -uroot -pprestashop prestashop"

echo "==> Waiting for PrestaShop to finish its first-boot auto-install…"
# PS auto-installs; wait until the storefront returns 200 (not 302 to /install).
for i in $(seq 1 120); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8082/ || true)
  if [ "$code" = "200" ]; then
    echo "    PrestaShop storefront is up (HTTP 200)"
    break
  fi
  printf '.' >&2
  sleep 3
done
echo

echo "==> Installing the Convor module + registering displayHeader…"
# Best path: use PrestaShop's own Module::install() so the hook is registered
# correctly. We drive it through a tiny PHP snippet run inside the container.
$CMS php -r '
require_once "/var/www/html/config/config.inc.php";
$module = Module::getInstanceByName("convor");
if (!Validate::isLoadedObject($module)) {
    fwrite(STDERR, "module convor not found on disk\n");
    exit(1);
}
// Install registers displayHeader via parent::install() + registerHook().
if (!$module->id) {
    $module->install();
}
// (Re)register the hook idempotently in case install() already ran.
$module->registerHook("displayHeader");
echo "module id=" . (int)$module->id . "\n";
'

echo "==> Writing Convor config values into ps_configuration…"
$DB <<SQL
INSERT INTO ps_configuration (name, value, date_add, date_upd)
VALUES
  ('CONVOR_ENABLED',  '1',                    NOW(), NOW()),
  ('CONVOR_ORG_SLUG', '${ORG_SLUG}',          NOW(), NOW()),
  ('CONVOR_API_BASE', '${API_BASE}',          NOW(), NOW())
ON DUPLICATE KEY UPDATE value = VALUES(value), date_upd = NOW();
SQL

# Clear the Smarty/object cache so config + module changes take effect.
$CMS rm -rf /var/www/html/var/cache/prod/* /var/www/html/var/cache/dev/* 2>/dev/null || true

echo
echo "✓ PrestaShop installed; Convor module enabled."
echo "  org_slug=${ORG_SLUG}  api_base=${API_BASE}"
echo "  Verify: curl -s http://localhost:8082/ | grep -o '<script[^>]*widget\\.js[^>]*></script>'"
