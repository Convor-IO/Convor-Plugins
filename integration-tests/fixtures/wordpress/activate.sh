#!/usr/bin/env bash
# Activate the Convor plugin on the local WordPress container and configure
# it with org_slug=acme and api_base=http://localhost:5173 (the built widget).
#
# Run AFTER `docker compose up -d` and the famous 5-minute install (see
# README.md). Idempotent.
set -euo pipefail
cd "$(dirname "$0")"

API_BASE="${WIDGET_API_BASE:-http://localhost:5173}"

# Build the correctly-serialized option values using PHP inside the WP
# container (avoids hand-rolled serialize-length bugs).
read -r SETTINGS ACTIVE <<EOF
$(docker compose exec -T wp php -r '
echo serialize(array("org_slug"=>"acme","api_base"=>"'"$API_BASE"'","enabled"=>true));
echo " ";
echo serialize(array("convor/convor.php"));
')
EOF

docker compose exec -T db mariadb -uwordpress -pwordpress wordpress <<SQL
INSERT INTO wp_options (option_name, option_value, autoload) VALUES
  ('active_plugins', '${ACTIVE}', 'yes'),
  ('convor_settings', '${SETTINGS}', 'yes')
ON DUPLICATE KEY UPDATE option_value = VALUES(option_value);
SQL

echo "✓ Convor plugin activated; org_slug=acme, api_base=${API_BASE}"
echo "  Verify: curl -s http://localhost:8080/ | grep widget.js"
