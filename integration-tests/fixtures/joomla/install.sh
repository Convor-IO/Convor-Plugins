#!/usr/bin/env bash
# Bootstrap a real Joomla 5 install, install + enable the Convor system plugin,
# and configure it so the widget snippet renders on the front end.
#
# Run AFTER `docker compose up -d`. Idempotent.
#
#   ./install.sh && curl -s http://localhost:8081/ | grep widget.js
set -euo pipefail
cd "$(dirname "$0")"

API_BASE="${WIDGET_API_BASE:-http://localhost:5173}"
ORG_SLUG="${CONVOR_ORG_SLUG:-test-org}"
CMS="docker compose exec -T joomla"
DB="docker compose exec -T db mariadb -ujoomla -pjoomla joomla"

echo "==> Waiting for Joomla install screen to be reachable…"
# The official joomla image ships the installer; wait until Apache answers.
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8081/ || true)
  if [ "$code" != "000" ] && [ "$code" != "" ]; then
    echo "    Joomla responds (HTTP $code)"
    break
  fi
  sleep 2
done

echo "==> Running the Joomla CLI installer…"
# The joomla image bundles installation/joomla.php — a headless installer.
# This performs the full site setup (creates tables, admin user, config).
$CMS php installation/joomla.php install \
  --admin-user=admin \
  --admin-username=admin \
  --admin-password='ConvorAdmin123!' \
  --admin-email=admin@example.com \
  --site-name="Convor Test" \
  --db-host=db:3306 \
  --db-user=joomla \
  --db-pass=joomla \
  --db-name=joomla \
  --db-prefix=jos_ \
  --db-type=mysqli 2>&1 || echo "    (install may have already run; continuing)"

# Make the web root writable enough that the front end can render (the
# official image sometimes leaves cache/ owned by root). Best-effort.
$CMS chown -R www-data:www-data /var/www/html/cache /var/www/html/administrator/cache /var/www/html/tmp 2>/dev/null || true

echo "==> Registering + enabling the Convor plugin via DB (extension table)…"
# Build the correctly-serialised Joomla params JSON inside the container.
PARAMS=$($CMS php -r '
echo json_encode([
  "enabled"  => 1,
  "org_slug" => getenv("ORG") ?: "test-org",
  "api_base" => getenv("API") ?: "http://localhost:5173",
]);
' ORG="$ORG_SLUG" API="$API_BASE")

# Build a valid manifest_cache from the plugin's own XML (Joomla's plugin
# importer refuses to load a plugin whose manifest_cache is empty).
MANIFEST=$($CMS php -r '
$xml = simplexml_load_file("/var/www/html/plugins/system/convor/convor.xml");
$m = [
  "name"        => (string) $xml->name,
  "type"        => "plugin",
  "creationDate"=> (string) $xml->creationDate,
  "author"      => (string) $xml->author,
  "copyright"   => (string) $xml->copyright,
  "authorEmail" => (string) $xml->authorEmail,
  "authorUrl"   => (string) $xml->authorUrl,
  "version"     => (string) $xml->version,
  "description" => (string) $xml->description,
  "group"       => (string) $xml["group"],
];
echo json_encode($m, JSON_UNESCAPED_SLASHES);
')

$DB <<SQL
INSERT INTO jos_extensions
  (package_id, name, type, element, folder, client_id, enabled, access,
   protected, locked, manifest_cache, params, custom_data,
   checked_out, checked_out_time, ordering, state, note)
VALUES
  (0, 'plg_system_convor', 'plugin', 'convor', 'system', 0, 1, 1,
   0, 0, '${MANIFEST}', '${PARAMS}', '',
   NULL, NULL, 0, 0, NULL)
ON DUPLICATE KEY UPDATE
  enabled         = 1,
  manifest_cache  = VALUES(manifest_cache),
  params          = VALUES(params);
SQL

echo "==> Restarting apache so the plugin cache reloads…"
$CMS apache2ctl graceful 2>/dev/null || true

echo
echo "✓ Joomla installed; Convor plugin enabled."
echo "  org_slug=${ORG_SLUG}  api_base=${API_BASE}"
echo "  Verify: curl -s http://localhost:8081/ | grep -o '<script[^>]*widget\\.js[^>]*></script>'"
