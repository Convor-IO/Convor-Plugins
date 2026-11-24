#!/usr/bin/env bash
# Actual public HTTPS merchant callback + isolated local SaaS. No production
# endpoints and no host port or direct shop access to the SaaS DB/Redis network.
set -euo pipefail
cd "$(dirname "$0")/../../.."
root=$PWD
export QA_STATE_DIR="$root/dist/prestashop-public-qa"
container=convor-ps-qa-1807-prestashop-1
relay=convor-ps-qa-1807-pairing-relay-1
config=/var/www/html/config/defines_custom.inc.php
backup=/tmp/convor-1807-public-pairing-config.bak
compose=(docker compose --env-file "$QA_STATE_DIR/.env" -f integration-tests/fixtures/prestashop/public-qa.compose.yml --profile pairing)
test "$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$container")" = convor-ps-qa-1807
test "$(docker network inspect convor-feat-prestashop-finalization-1807-dev_convor --format '{{index .Labels "com.docker.compose.project"}}')" = convor-feat-prestashop-finalization-1807-dev
test -z "$(docker ps -aq --filter "name=^/${relay}$")"
test "$(docker inspect -f '{{len .NetworkSettings.Networks}}' "$container")" = 1
docker exec -u www-data "$container" php -r 'require "/var/www/html/config/config.inc.php";if(!Module::isInstalled("convor")||Module::getInstanceByName("convor")->settings()["widget_key"]!==""||defined("CONVOR_PRESTASHOP_LOCAL_QA"))exit(1);'
docker exec "$container" sh -ec 'test -f "$1"; test ! -e "$2"; cp -p "$1" "$2"' sh "$config" "$backup"
cleanup() {
  result=$?
  trap - EXIT
  set +e
  docker exec -u www-data "$container" php -r 'require "/var/www/html/config/config.inc.php";if(Module::isInstalled("convor")){if(!Module::getInstanceByName("convor")->saveSettings(Convor::defaults()))exit(1);Tools::clearSmartyCache();}' || result=1
  docker exec "$container" sh -ec 'cp -p "$2" "$1"; cmp "$1" "$2"; rm "$2"; apache2ctl graceful' sh "$config" "$backup" >/dev/null 2>&1 || result=1
  "${compose[@]}" rm -sf pairing-relay >/dev/null || result=1
  test -z "$(docker ps -aq --filter "name=^/${relay}$")" || result=1
  test "$(docker inspect -f '{{len .NetworkSettings.Networks}}' "$container")" = 1 || result=1
  if [ "$result" = 0 ]; then echo "PASS public fixture restored, relay removed"; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
"${compose[@]}" up -d --no-deps pairing-relay
docker exec "$relay" nginx -t
# Confirm the relay is not a general-purpose proxy.
test "$(docker exec "$container" curl -sS -o /dev/null -w '%{http_code}' http://server:3000/health)" = 404
test "$(docker exec "$container" curl -sS -o /dev/null -w '%{http_code}' http://server:3000/api/prestashop/pairing/redeem)" = 403
docker exec -i "$container" sh -ec 'cat >> "$1"; php -l "$1"; apache2ctl graceful' sh "$config" <<'PHP'

define('CONVOR_PRESTASHOP_LOCAL_QA', true);
define('CONVOR_PRESTASHOP_API_BASE', 'http://server:3000');
define('CONVOR_PRESTASHOP_CDN_BASE', 'http://localhost:17243');
define('CONVOR_PRESTASHOP_DASHBOARD_BASE', 'http://localhost:17244');
PHP
mkdir -p dist/public-pairing-qa
(cd dist/public-pairing-qa && node ../../integration-tests/fixtures/prestashop/provision-local-qa.mjs)
source dist/public-pairing-qa/dist/prestashop-qa.env
node integration-tests/fixtures/prestashop/test-public-pairing.mjs
