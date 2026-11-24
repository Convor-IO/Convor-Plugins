#!/usr/bin/env bash
# A real upload and two-way chat using the keyless Marketplace envelope.
# Only the owned 9.2.1 QA shop; restore its exact direct archive and settings.
set -euo pipefail
cd "$(dirname "$0")/../../.."
container=convor-prestashop-1807-prestashop-1
test "$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$container")" = convor-prestashop-1807
test "$(docker inspect -f '{{.State.Running}}' "$container")" = true
python3 integration-tests/fixtures/prestashop/verify-installed-archive.py convor-prestashop-1807
(cd dist/prestashop-marketplace/package && sha256sum -c convor.zip.sha256)
python3 -c 'import json; m=json.load(open("dist/prestashop-marketplace/package/manifest.json")); assert m["status"]=="PREFLIGHT_ONLY_NO_MODULE_KEY" and not m["official_validator_passed"]'
snapshot=$(docker exec -u www-data "$container" php -r 'require "/var/www/html/config/config.inc.php";echo json_encode(Module::getInstanceByName("convor")->settings(),JSON_THROW_ON_ERROR);')
console() {
  docker exec -u www-data "$container" php /var/www/html/bin/console --env=prod prestashop:module "$@" --no-interaction
}
restore() {
  local prior=$?
  trap - EXIT
  set +e
  if docker exec -u www-data "$container" php -r 'require "/var/www/html/config/config.inc.php";exit(Module::isInstalled("convor")?0:1);'; then
    console uninstall convor || exit 1
  fi
  if docker exec "$container" test -d /var/www/html/modules/convor; then
    console delete convor || exit 1
  fi
  docker cp dist/prestashop/convor.zip "$container:/var/www/html/convor-qa-restore.zip" || exit 1
  docker exec "$container" sh -ec 'unzip -oq /var/www/html/convor-qa-restore.zip -d /var/www/html/modules; rm /var/www/html/convor-qa-restore.zip; chown -R www-data:www-data /var/www/html/modules/convor' || exit 1
  console install convor || exit 1
  docker exec -e QA_SETTINGS="$snapshot" -u www-data "$container" php -r 'require "/var/www/html/config/config.inc.php";if(!Module::getInstanceByName("convor")->saveSettings(json_decode(getenv("QA_SETTINGS"),true,512,JSON_THROW_ON_ERROR)))exit(1);' || exit 1
  docker exec "$container" apache2ctl graceful || exit 1
  python3 integration-tests/fixtures/prestashop/verify-installed-archive.py convor-prestashop-1807 || exit 1
  echo 'PASS: original direct archive and shop settings restored'
  exit "$prior"
}
trap restore EXIT
mkdir -p dist/marketplace-qa
(cd dist/marketplace-qa && node ../../integration-tests/fixtures/prestashop/provision-local-qa.mjs)
source dist/marketplace-qa/dist/prestashop-qa.env
console uninstall convor
console delete convor
docker exec "$container" apache2ctl graceful
PRESTASHOP_URL=http://localhost:18217 PRESTASHOP_MARKETPLACE_PREFLIGHT=1 pnpm exec playwright test --config integration-tests/playwright.config.ts prestashop.spec.ts --workers=1 -g 'ZIP install, secure pairing and real two-way chat'
python3 integration-tests/fixtures/prestashop/verify-installed-archive.py convor-prestashop-1807 --archive dist/prestashop-marketplace/package/convor.zip
echo 'PASS: exact keyless Marketplace envelope, real BO upload/pairing and two-way chat; not official validation'
