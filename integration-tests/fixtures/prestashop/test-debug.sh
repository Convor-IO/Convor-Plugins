#!/usr/bin/env bash
# Run the module against the actual PS9.0.3 fixture with E_ALL enabled.
set -euo pipefail
cd "$(dirname "$0")/../../.."
container=convor-prestashop-1807-90-prestashop-1
db=convor-prestashop-1807-90-db-1
test "$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$container")" = convor-prestashop-1807-90
test "$(docker inspect -f '{{.State.Running}}' "$container")" = false
test "$(docker inspect -f '{{.State.Running}}' "$db")" = false
docker start "$db" "$container" >/dev/null
conf=/var/www/html/config/defines_custom.inc.php
backup=/var/www/html/config/defines_custom.convor-qa-debug.bak
profiler=/var/www/html/app/config/config_dev.yml
profiler_backup="$profiler.convor-qa-debug.bak"
log_conf=/etc/apache2/conf-enabled/convor-qa-debug-log-only.conf
log_conf_created=0
shipping_disabled=0
restore() {
  if [ "$log_conf_created" = 1 ]; then
    docker exec "$container" rm "$log_conf"
  fi
  if docker exec "$container" test -f "$profiler_backup"; then
    docker exec "$container" mv "$profiler_backup" "$profiler"
  fi
  if docker exec "$container" test -f "$backup"; then
    docker exec "$container" mv "$backup" "$conf"
    docker exec "$container" apache2ctl graceful >/dev/null 2>&1 || true
  fi
  if [ "$shipping_disabled" = 1 ]; then
    bash integration-tests/fixtures/prestashop/set-bundled-shipping-fixture.sh enable
  fi
  docker stop "$container" "$db" >/dev/null
}
trap restore EXIT
for i in $(seq 1 60); do
  if curl -fsS -o /dev/null --max-time 5 http://localhost:18222/; then break; fi
  sleep 2
done
curl -fsS -o /dev/null --max-time 10 http://localhost:18222/
if [ "${PRESTASHOP_DISABLE_BUNDLED_SHIPPING:-0}" = 1 ]; then
  # PS9.0.3 bundles psshipping 2.0.9, whose unconfigured native checkout
  # returns HTTP 400 independently of Convor. Isolate the ordinary checkout
  # in this disposable fixture only. Never disable a merchant's carrier.
  docker exec -u www-data "$container" php -r 'require "/var/www/html/config/config.inc.php";if(!Module::isEnabled("psshipping"))exit(1);'
  shipping_disabled=1
  bash integration-tests/fixtures/prestashop/set-bundled-shipping-fixture.sh disable
fi
docker exec "$container" sh -ec 'test ! -e "$2"; cp "$1" "$2"; sed -i "2i define(\x27_PS_MODE_DEV_\x27, true);\ndefine(\x27_PS_DISPLAY_COMPATIBILITY_WARNING_\x27, true);" "$1"; chown -R www-data:www-data /var/www/html/var/cache/dev' sh "$conf" "$backup"
# Keep PHP debug E_ALL and Symfony dev mode, but disable the profiler's
# floating UI: it covers actual BO inputs at the fixture viewport and can
# redirect Playwright clicks to the profiler rather than the module form.
docker exec "$container" sh -ec 'test ! -e "$2"; cp -p "$1" "$2"; sed -i "s/^  toolbar:.*/  toolbar: false/" "$1"; grep -q "^  toolbar: false$" "$1"; rm -rf /var/www/html/var/cache/dev/*' sh "$profiler" "$profiler_backup"
if [ "${PRESTASHOP_DEBUG_LOG_ONLY:-0}" = 1 ]; then
  # PrestaShop 9.0.3 core diagnostics can corrupt the AJAX cart JSON when
  # displayed. Preserve debug E_ALL and log all diagnostics instead.
  docker exec "$container" sh -ec 'test ! -e "$1"; apache2ctl -M 2>/dev/null | grep -q php_module; printf "php_admin_flag display_errors Off\\nphp_admin_flag log_errors On\\n" > "$1"' sh "$log_conf"
  log_conf_created=1
  docker exec "$container" apache2ctl configtest
fi
docker exec "$container" apache2ctl graceful
docker exec -u www-data "$container" php -r 'require "/var/www/html/config/config.inc.php"; if (!_PS_MODE_DEV_ || error_reporting() !== E_ALL) exit(1); echo "Actual PS debug E_ALL enabled\n";'
source dist/prestashop-qa.env
started=$(date -Iseconds)
result=0
PRESTASHOP_URL=http://localhost:18222 pnpm exec playwright test --config integration-tests/playwright.config.ts prestashop.spec.ts --workers=1 -g "${PRESTASHOP_DEBUG_GREP:-API pairing|verified customers|product variants|verification markup}" --reporter=line || result=$?
# Only module-origin diagnostics: upstream PS/core notices are not evidence
# of a Convor error. Never emit raw error logs or credentials.
if docker logs --since "$started" "$container" 2>&1 | grep -E 'PHP (Warning|Notice|Deprecated|Fatal error|Parse error).*modules/convor/' >/dev/null; then
  echo 'Module-origin PHP diagnostic found; inspect locally' >&2
  exit 1
fi
if [ "$result" -ne 0 ]; then
  echo "FAIL PS9.0.3 debug E_ALL (Playwright exit $result)"
  exit "$result"
fi
echo "PASS PS9.0.3 real debug E_ALL (log-only=${PRESTASHOP_DEBUG_LOG_ONLY:-0}); no module-origin PHP diagnostics in Apache logs"
