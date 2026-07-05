#!/usr/bin/env bash
# Bootstrap a real Drupal 11 install, enable the convor_widget module, and
# configure it so the widget snippet renders on every page.
#
# Run AFTER `docker compose up -d`. Idempotent.
#
#   ./install.sh && curl -s http://localhost:8083/ | grep widget.js
set -euo pipefail
cd "$(dirname "$0")"

API_BASE="${WIDGET_API_BASE:-http://localhost:5173}"
ORG_SLUG="${CONVOR_ORG_SLUG:-test-org}"

# The drupal:php8.3-apache image installs Drupal as a composer project under
# /opt/drupal, with the web document root symlinked at /var/www/html ->
# /opt/drupal/web. Drush lives at /opt/drupal/vendor/bin/drush and must be
# run with the working directory inside the web root.
DR="docker exec -w /opt/drupal/web -e COLUMNS=120 drupal-drupal-1 /opt/drupal/vendor/bin/drush"

echo "==> Waiting for the Drupal container to be ready…"
for i in $(seq 1 60); do
  if docker exec drupal-drupal-1 test -d /opt/drupal/vendor; then
    echo "    Drupal filesystem ready"
    break
  fi
  sleep 2
done

echo "==> Installing Drush (site-wide, if not yet vendored)…"
if ! docker exec drupal-drupal-1 test -x /opt/drupal/vendor/bin/drush; then
  docker exec -w /opt/drupal drupal-drupal-1 composer require --no-interaction drush/drush:^13 2>&1 | tail -3
fi

echo "==> Running the Drupal site installer…"
$DR site:install -y \
  --db-url='pgsql://drupal:drupal@db/drupal' \
  --account-name=admin \
  --account-pass=adminadmin \
  --account-mail=admin@example.com \
  --site-name="Convor Test" \
  standard 2>&1 || echo "    (site may have already been installed; continuing)"

echo "==> Enabling the convor_widget module…"
$DR pm:enable -y convor_widget 2>&1 | tail -3

echo "==> Writing convor_widget.settings config…"
# config:set writes correctly-typed config (no serialize-length bugs).
$DR config:set -y convor_widget.settings enabled true 2>&1 | tail -1
$DR config:set -y convor_widget.settings org_slug "${ORG_SLUG}" 2>&1 | tail -1
$DR config:set -y convor_widget.settings api_base "${API_BASE}" 2>&1 | tail -1

echo "==> Clearing caches…"
$DR cache:rebuild 2>&1 | tail -2

echo
echo "✓ Drupal installed; convor_widget enabled."
echo "  org_slug=${ORG_SLUG}  api_base=${API_BASE}"
echo "  Verify: curl -s http://localhost:8083/ | grep -o '<script[^>]*widget\\.js[^>]*></script>'"
