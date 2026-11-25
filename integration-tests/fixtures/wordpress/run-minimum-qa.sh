#!/usr/bin/env bash
# Compatibility smoke for the oldest declared WordPress/PHP versions.
# Requires the isolated local Convor stack described in README.md.
set -euo pipefail
cd "$(dirname "$0")/../../.."
root=$PWD
export WP_COMPOSE_PROJECT=convor-wordpress-1807
export WP_IMAGE=wordpress:6.0-php8.0-apache
export WP_PORT=18207
export WP_URL=http://127.0.0.1:18207
export WP_QA_CONTAINER=convor-wordpress-1807-wp-1
export CONVOR_API_URL="${CONVOR_API_URL:-http://localhost:17203}"
export CONVOR_DASHBOARD_URL="${CONVOR_DASHBOARD_URL:-http://localhost:17204}"
network="${CONVOR_QA_NETWORK:-convor-feat-wordpress-finalization-1806-dev_convor}"
if [[ "$network" != convor-*-dev_convor ]]; then
  echo "Dedicated Convor dev network required" >&2
  exit 1
fi
python3 scripts/build-wordpress.py
if [[ "${WP_QA_EXISTING_STACK:-0}" != 1 ]]; then
  docker compose -f integration-tests/fixtures/wordpress/docker-compose.yml up -d --wait db wp
fi
for attempt in $(seq 1 30); do
  if docker exec "$WP_QA_CONTAINER" test -f /var/www/html/wp-config.php; then break; fi
  sleep 2
done
if ! docker inspect -f '{{json .NetworkSettings.Networks}}' "$WP_QA_CONTAINER" | grep -Fq "\"$network\""; then
  docker network connect "$network" "$WP_QA_CONTAINER"
fi
docker exec -e WP_URL "$WP_QA_CONTAINER" php -r '
define("WP_INSTALLING", true);
$_SERVER["HTTP_HOST"] = parse_url(getenv("WP_URL"), PHP_URL_HOST) . ":" . parse_url(getenv("WP_URL"), PHP_URL_PORT);
$_SERVER["REQUEST_URI"] = "/";
require "/var/www/html/wp-load.php";
require_once ABSPATH . "wp-admin/includes/upgrade.php";
if (!is_blog_installed()) {
  $result=wp_install("Convor minimum compatibility QA", "fixtureadmin", "fixture@example.test", false, "", wp_generate_password(32, true, true));
  if (is_wp_error($result)) exit(1);
}
update_option("siteurl", getenv("WP_URL"));
update_option("home", getenv("WP_URL"));
echo "WordPress ".get_bloginfo("version")."; PHP ".PHP_VERSION.PHP_EOL;
if (version_compare(get_bloginfo("version"), "6.0", "<") || version_compare(get_bloginfo("version"), "6.1", ">=") || PHP_MAJOR_VERSION !== 8 || PHP_MINOR_VERSION !== 0) exit(1);
'
docker exec "$WP_QA_CONTAINER" mkdir -p /var/www/html/wp-content/mu-plugins
docker cp integration-tests/fixtures/wordpress/convor-local-fixture.php "$WP_QA_CONTAINER":/var/www/html/wp-content/mu-plugins/convor-local-fixture.php
docker cp "$root/dist/convor-1.0.0.zip" "$WP_QA_CONTAINER":/tmp/convor-qa.zip
docker exec -u www-data "$WP_QA_CONTAINER" php -r '
require "/var/www/html/wp-load.php";
require_once ABSPATH . "wp-admin/includes/admin.php";
require_once ABSPATH . "wp-admin/includes/class-wp-upgrader.php";
$upgrader = new Plugin_Upgrader(new Automatic_Upgrader_Skin());
$installed = $upgrader->install("/tmp/convor-qa.zip", array("overwrite_package" => true));
if (is_wp_error($installed) || !$installed) { fwrite(STDERR, "ZIP installation failed\n"); exit(1); }
$result=activate_plugin("convor/convor.php");
if (is_wp_error($result)) { fwrite(STDERR,$result->get_error_message()); exit(1); }
echo "Convor plugin active\n";
'
# Preserve the current-version fixture configuration.
backup="$(mktemp "$root/dist/wordpress-qa-backup.XXXXXX")"
had_env=0
if [[ -f dist/wordpress-qa.env ]]; then
  cp dist/wordpress-qa.env "$backup"
  had_env=1
fi
cleanup_env() {
  if [[ "$had_env" = 1 ]]; then
    cp "$backup" dist/wordpress-qa.env
  else
    rm -f dist/wordpress-qa.env
  fi
  rm -f "$backup"
}
trap cleanup_env EXIT
node integration-tests/fixtures/wordpress/provision-local-qa.mjs
cp dist/wordpress-qa.env dist/wordpress-qa-minimum.env
source dist/wordpress-qa.env
bash integration-tests/fixtures/wordpress/run-real-qa.sh -g 'Real WordPress pairing callback|Manual widget key'
