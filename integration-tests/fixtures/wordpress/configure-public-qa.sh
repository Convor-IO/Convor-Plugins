#!/usr/bin/env bash
# Bind the isolated WordPress demo to the actual temporary HTTPS tunnel URL.
# Does not alter the user's existing Cloudflare tunnel, DNS, or SaaS.
set -euo pipefail
cd "$(dirname "$0")/../../.."
url="${1:?Pass the generated https://*.trycloudflare.com address}"
url="${url%/}"
[[ "$url" =~ ^https://[a-z0-9-]+\.trycloudflare\.com$ ]] || {
  echo "Only an HTTPS quick-tunnel host is allowed" >&2
  exit 1
}
docker exec -e WP_DEMO_URL="$url" -u www-data convor-wordpress-1809-wp-1 php -r '
$url=getenv("WP_DEMO_URL");
$_SERVER["HTTP_HOST"]=parse_url($url,PHP_URL_HOST);
$_SERVER["HTTPS"]="on";
$_SERVER["REQUEST_URI"]="/";
require "/var/www/html/wp-load.php";
if(!is_blog_installed() || get_option("blog_public") || get_option("users_can_register")) exit(1);
update_option("home",$url);
update_option("siteurl",$url);
echo "Public home: ".home_url("/").PHP_EOL;
'
for route in / /wp-login.php /xmlrpc.php /wp-config.php /wp-cron.php; do
  code="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' "$url$route")"
  case "$route" in
    /|/wp-login.php) expected=200 ;;
    *) expected=403 ;;
  esac
  [[ "$code" = "$expected" ]] || { echo "FAIL $route HTTP $code, expected $expected" >&2; exit 1; }
  echo "PASS $route HTTP $code"
done
curl -fsS --max-time 20 "$url/" | grep -E '<meta name=.robots.[^>]*noindex' >/dev/null
echo "PASS noindex"
