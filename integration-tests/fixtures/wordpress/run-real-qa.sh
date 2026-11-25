#!/usr/bin/env bash
# Only run with the isolated local WordPress and Convor QA stacks.
set -euo pipefail
cd "$(dirname "$0")/../../.."
export WP_URL="${WP_URL:-http://127.0.0.1:18206}"
export CONVOR_API_URL="${CONVOR_API_URL:-http://localhost:17203}"
export CONVOR_DASHBOARD_URL="${CONVOR_DASHBOARD_URL:-http://localhost:17204}"
# Credentials are generated for the disposable test environment; never use
# a real customer, operator or production site.
: "${WP_ADMIN_USER:?Set the isolated WordPress fixture admin username}"
: "${WP_ADMIN_PASSWORD:?Set the isolated WordPress fixture admin password}"
: "${CONVOR_TEST_EMAIL:?Set the isolated Convor fixture email}"
: "${CONVOR_TEST_PASSWORD:?Set the isolated Convor fixture password}"
: "${CONVOR_ORG_ID:?Set the fixture organization ID}"
: "${CONVOR_PROJECT_ID:?Set the fixture website ID}"
for url in "$WP_URL" "$CONVOR_API_URL" "$CONVOR_DASHBOARD_URL"; do
  case "$url" in http://localhost:*|http://127.0.0.1:*) ;; *) echo "Only loopback QA URLs allowed" >&2; exit 1;; esac
done
CONVOR_WORDPRESS_LOCAL_QA=1 pnpm test:e2e wordpress.spec.ts --workers=1 "$@"
