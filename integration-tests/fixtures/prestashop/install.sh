#!/usr/bin/env bash
# Prepare the isolated fixture; Playwright uploads the exact release ZIP.
set -euo pipefail
cd "$(dirname "$0")/../../.."
export PRESTASHOP_PORT=${PRESTASHOP_PORT:-18217}
export PRESTASHOP_URL="http://localhost:$PRESTASHOP_PORT"
PROJECT=${PRESTASHOP_QA_PROJECT:-convor-prestashop-1807}
case "$PROJECT:$PRESTASHOP_PORT" in
  convor-prestashop-1807:18217|convor-prestashop-1807-82:18218|convor-prestashop-1807-91:18221|convor-prestashop-1807-90:18222) ;;
  *) echo "Unsupported disposable QA project/port" >&2; exit 1 ;;
esac
CONTAINER="$PROJECT-prestashop-1"
# Pinned tested images. Do not accidentally recreate a fixture using another
# version when a shell has inherited PRESTASHOP_VERSION.
case "$PROJECT:${PRESTASHOP_VERSION:-9.2.1}" in
  convor-prestashop-1807:9.2.1) export PRESTASHOP_IMAGE=prestashop/prestashop:9.2.1@sha256:ad8ce05927bb28f5fb4da08a278dea43e10a1fed032e666baa27214303cfc8c9 ;;
  convor-prestashop-1807-82:8.2.9) export PRESTASHOP_IMAGE=prestashop/prestashop:8.2.9@sha256:05f4a15cee2a0480cd8602f97efbcef8262517d5a3030b661786ff71fe8fcd16 ;;
  convor-prestashop-1807-91:9.1.5) export PRESTASHOP_IMAGE=prestashop/prestashop:9.1.5@sha256:4e2615d81e2f2dfe5cde1e9b2cef59200734fd56a9c19e03240988530d32a7bf ;;
  convor-prestashop-1807-90:9.0.3) export PRESTASHOP_IMAGE=prestashop/prestashop:9.0.3@sha256:58f202b544c1324f654fdb54bea25e36c93245801c4c1d2c7c402e752343aa85 ;;
  *) echo "Unsupported fixture version" >&2; exit 1 ;;
esac
COMPOSE=(docker compose -p "$PROJECT" -f integration-tests/fixtures/prestashop/docker-compose.yml)
python3 scripts/build-prestashop.py
"${COMPOSE[@]}" up -d
deadline=$((SECONDS + 900))
until curl -fsS -o /dev/null --max-time 5 "http://localhost:$PRESTASHOP_PORT/"; do
  if [[ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER")" != true ]] || (( SECONDS > deadline )); then
    docker logs --tail=50 "$CONTAINER"
    exit 1
  fi
  sleep 3
done
# Connect only the disposable shop to this feature branch’s isolated SaaS network.
NETWORK=convor-feat-prestashop-finalization-1807-dev_convor
if ! docker inspect -f '{{range $name, $network := .NetworkSettings.Networks}}{{println $name}}{{end}}' "$CONTAINER" | grep -Fxq "$NETWORK"; then
  docker network connect "$NETWORK" "$CONTAINER"
fi
# Local-only configuration outside the distributed module.
cat <<'PHP' | docker exec -i "$CONTAINER" sh -c 'cat > /var/www/html/config/defines_custom.inc.php'
<?php
define('CONVOR_PRESTASHOP_LOCAL_QA', true);
define('CONVOR_PRESTASHOP_CDN_BASE', 'http://localhost:17243');
define('CONVOR_PRESTASHOP_API_BASE', 'http://server:3000');
define('CONVOR_PRESTASHOP_DASHBOARD_BASE', 'http://localhost:17244');
PHP
if [[ "$PROJECT" == "convor-prestashop-1807" ]]; then
  node integration-tests/fixtures/prestashop/provision-local-qa.mjs
else
  echo "Compatibility fixture: source the isolated QA environment and override PRESTASHOP_URL=$PRESTASHOP_URL"
fi
echo 'Ready: source dist/prestashop-qa.env && pnpm exec playwright test --config integration-tests/playwright.config.ts prestashop.spec.ts --workers=1'
