#!/usr/bin/env bash
# Run the same immutable ZIP through the four owned local fixtures.
set -euo pipefail
cd "$(dirname "$0")/../../.."
# A fresh synthetic tenant per complete run prevents the legitimate Free
# conversation quota from being exhausted by earlier acceptance runs.
node integration-tests/fixtures/prestashop/provision-local-qa.mjs
source dist/prestashop-qa.env
(cd dist/prestashop && sha256sum -c convor.zip.sha256)
for entry in '18217:convor-prestashop-1807' '18218:convor-prestashop-1807-82' '18222:convor-prestashop-1807-90' '18221:convor-prestashop-1807-91'; do
  port=${entry%%:*}
  project=${entry#*:}
  container="$project-prestashop-1"
  db="$project-db-1"
  test "$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$container")" = "$project"
  docker start "$db" "$container" >/dev/null
  for ((i=0;i<60;i++)); do
    if curl -fsS -o /dev/null --max-time 5 "http://localhost:$port/"; then break; fi
    sleep 2
  done
  curl -fsS -o /dev/null --max-time 10 "http://localhost:$port/"
  docker exec -u www-data "$container" php /var/www/html/bin/console --env=prod prestashop:module uninstall convor --no-interaction
  docker exec -u www-data "$container" php /var/www/html/bin/console --env=prod prestashop:module delete convor --no-interaction
  docker exec "$container" apache2ctl graceful
  echo "=== $project on $port ==="
  if [[ "$port" == 18222 ]]; then
    # Native default psshipping 2.0.9 HTTP400 is independently reproduced.
    # Test standard checkout without that unconfigured optional provider;
    # restore its original state even on test failure.
    original=$(docker exec -u www-data "$container" php -r 'require "/var/www/html/config/config.inc.php";echo (int)Module::isEnabled("psshipping");')
    if [[ "$original" == 1 ]]; then
      trap 'result=$?; bash integration-tests/fixtures/prestashop/set-bundled-shipping-fixture.sh enable || result=1; docker stop "$container" "$db" >/dev/null || result=1; exit "$result"' EXIT
      bash integration-tests/fixtures/prestashop/set-bundled-shipping-fixture.sh disable
    fi
  fi
  PRESTASHOP_URL="http://localhost:$port" pnpm exec playwright test --config integration-tests/playwright.config.ts prestashop.spec.ts --workers=1
  if [[ "$port" == 18222 && "${original:-0}" == 1 ]]; then
    bash integration-tests/fixtures/prestashop/set-bundled-shipping-fixture.sh enable
    trap - EXIT
  fi
  # Verify every distributed file, including nested PHP/JS and generated index guards.
  python3 integration-tests/fixtures/prestashop/verify-installed-archive.py "$project"
  if [[ "$port" == 18221 || "$port" == 18222 ]]; then
    docker stop "$container" "$db" >/dev/null
  fi
done
echo 'PASS: all four real PrestaShop fixtures, exact archive'
