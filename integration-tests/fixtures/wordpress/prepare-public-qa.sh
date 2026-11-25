#!/usr/bin/env bash
# Disposable WordPress-only demo. Do not point the demo at a customer project.
# The public tunnel is started separately as an owned foreground service,
# after WordPress has been installed and its administrator has been secured.
set -euo pipefail
cd "$(dirname "$0")/../../.."
umask 077
mkdir -p dist
envfile=dist/wordpress-public-qa.env
if [[ ! -e "$envfile" ]]; then
  (
    set -o noclobber
    printf 'WP_DEMO_DB_ROOT_PASSWORD=%s\nWP_DEMO_DB_PASSWORD=%s\nWP_DEMO_ADMIN_PASSWORD=%s\n' \
      "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" > "$envfile"
  )
fi
chmod 600 "$envfile"
compose=(docker compose --env-file "$envfile" -f integration-tests/fixtures/wordpress/docker-compose.public-qa.yml)
"${compose[@]}" up -d --wait db wp
port="$(docker port convor-wordpress-1809-wp-1 80/tcp | awk -F: '$1=="127.0.0.1"{print $2}')"
[[ "$port" =~ ^[0-9]+$ ]]
for i in $(seq 1 30); do
  docker exec convor-wordpress-1809-wp-1 test -f /var/www/html/wp-config.php && break
  sleep 2
done
# Pin to the reviewed core release; update again before exposing a long-lived
# demo when a new security release is available. No QA auth/SSRF bypass plugin.
source "$envfile"
export WP_DEMO_ADMIN_PASSWORD
python3 scripts/build-wordpress.py
"${compose[@]}" --profile tools run --rm --entrypoint sh -e WP_DEMO_ADMIN_PASSWORD -e WP_DEMO_URL="http://127.0.0.1:$port" cli -ec '
  if ! wp core is-installed; then
    wp core install --url="$WP_DEMO_URL" --title="Convor WordPress demo (test only)" \
      --admin_user=convorqa --admin_email=fixture@example.test \
      --admin_password="$WP_DEMO_ADMIN_PASSWORD" --skip-email
  fi
  wp option update blog_public 0
  wp option update users_can_register 0
  wp option update default_comment_status closed
  wp option update default_ping_status closed
  wp core update --version=7.1.5
  wp core update-db
  wp plugin install /fixture-repo/dist/convor-1.0.0.zip --force --activate
  wp option update convor_settings "{\"enabled\":false,\"widget_key\":\"\",\"consent_required\":true}" --format=json
  wp post list --post_type=post --format=ids | xargs -r wp post update --comment_status=closed --ping_status=closed
  wp core version
  wp plugin get convor --field=version
'
# Harden the public HTTP surface. Local WP-CLI remains available for QA.
docker exec -u www-data convor-wordpress-1809-wp-1 sh -ec '
  f=/var/www/html/.htaccess
  if ! grep -q "Convor public QA protections" "$f" 2>/dev/null; then
    printf "\n# Convor public QA protections\n<FilesMatch \"^(xmlrpc\\\\.php|wp-config\\\\.php|wp-cron\\\\.php)\$\">\n    Require all denied\n</FilesMatch>\n<IfModule mod_headers.c>\n    Header always set X-Robots-Tag \"noindex, nofollow, noarchive\"\n</IfModule>\n" >> "$f"
  fi
'
docker exec convor-wordpress-1809-wp-1 sh -ec 'a2enmod headers >/dev/null; apache2ctl -k graceful 2>/dev/null'
echo "Prepared isolated demo on http://127.0.0.1:$port (not public yet)."
echo "Start a foreground quick tunnel with: cloudflared tunnel --config /dev/null --no-autoupdate --url http://127.0.0.1:$port --protocol http2"
echo "Set the resulting HTTPS address using: bash integration-tests/fixtures/wordpress/configure-public-qa.sh https://example.trycloudflare.com"
echo "Administrator: convorqa; secret stored only in ignored $envfile."
echo "Stop demo: docker compose --env-file $envfile -f integration-tests/fixtures/wordpress/docker-compose.public-qa.yml down"
