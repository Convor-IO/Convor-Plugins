#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
export WP_COMPOSE_PROJECT=convor-wordpress-1808
export WP_PORT=0
export WP_IMAGE="${WP_MULTISITE_IMAGE:-wordpress:php8.3-apache}"
compose=(docker compose -f integration-tests/fixtures/wordpress/docker-compose.yml)
cleanup() {
  "${compose[@]}" down -v
}
trap cleanup EXIT
python3 scripts/build-wordpress.py
"${compose[@]}" up -d --wait db wp
port="$(docker port convor-wordpress-1808-wp-1 80/tcp | awk -F: '$1=="127.0.0.1" {print $2}')"
[[ "$port" =~ ^[0-9]+$ ]]
"${compose[@]}" --profile tools run --rm --entrypoint sh -e QA_WP_URL="http://127.0.0.1:$port" cli /fixture-repo/integration-tests/fixtures/wordpress/multisite-lifecycle.sh
