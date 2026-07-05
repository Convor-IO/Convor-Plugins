#!/usr/bin/env bash
# Magento 2.4 + Convor_Widget module bootstrapper.
#
# Runs INSIDE the magento container (called by 00-autorun or directly) AFTER
# Magento is installed and the DB is up. It:
#   1. Waits for bin/magento to exist (composer create-project finished).
#   2. Enables the Convor_Widget module, runs setup:upgrade, cleans cache.
#   3. Sets the three config values (enabled, org_slug, api_base).
#   4. Reindexes + flushes so the storefront picks up the layout change.
#
# The module source is bind-mounted at /var/www/html/app/code/Convor/Widget.
set -eu

MAGE=/var/www/html/bin/magento
APP_CODE=/var/www/html/app/code/Convor/Widget

echo "== [convor] waiting for bin/magento (composer create-project) =="
for i in $(seq 1 120); do
  [ -x "$MAGE" ] && break
  sleep 5
done
if [ ! -x "$MAGE" ]; then
  echo "  bin/magento never appeared after 10min — aborting convor bootstrap" >&2
  exit 1
fi

echo "== [convor] module source present? =="
ls "$APP_CODE/registration.php" >/dev/null 2>&1 || {
  echo "  $APP_CODE/registration.php missing — bind-mount failed" >&2
  exit 1
}

echo "== [convor] enabling module + setup:upgrade =="
runuser -u www-data -- php "$MAGE" module:enable Convor_Widget
runuser -u www-data -- php "$MAGE" setup:upgrade
runuser -u www-data -- php "$MAGE" cache:clean

echo "== [convor] writing config =="
runuser -u www-data -- php "$MAGE" config:set convor_widget/general/enabled 1
runuser -u www-data -- php "$MAGE" config:set convor_widget/general/org_slug test-org
runuser -u www-data -- php "$MAGE" config:set convor_widget/general/api_base http://localhost:5173

echo "== [convor] flushing cache =="
runuser -u www-data -- php "$MAGE" cache:flush

echo "== [convor] DONE — module enabled + configured =="
echo "  Verify: curl -s http://localhost:8085/ | grep widget.js"
