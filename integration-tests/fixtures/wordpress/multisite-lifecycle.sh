#!/bin/sh
# Executed only in the disposable WP-CLI container by run-multisite-qa.sh.
set -eu
: "${QA_WP_URL:?missing local QA URL}"
case "$QA_WP_URL" in http://127.0.0.1:*) ;; *) exit 1;; esac
host="${QA_WP_URL#http://}"
case "$host" in *[!0-9.:]*) exit 1;; esac
main="$QA_WP_URL/"
second="$QA_WP_URL/second/"
zip=/fixture-repo/dist/convor-1.0.0.zip
if ! wp core is-installed --network --url="$main"; then
  wp core multisite-install --url="$main" --title="Convor multisite QA" \
    --admin_user=fixtureadmin --admin_email=fixture@example.test \
    --admin_password="$(php -r 'echo bin2hex(random_bytes(24));')" --skip-email
fi
if ! wp site list --field=url | grep -Fxq "$second"; then
  wp site create --url="$main" --slug=second --title="Second QA site" --email=fixture@example.test
fi
wp plugin install "$zip" --force --activate-network --url="$main"
wp core version --url="$main"
php -r 'echo "PHP ".PHP_VERSION.PHP_EOL;'
key1="convor_wpk_$(printf '%064d' 1)"
key2="convor_wpk_$(printf '%064d' 2)"
set_key() {
  wp option update convor_settings "{\"widget_key\":\"$2\",\"enabled\":true}" --format=json --url="$1"
}
fetch_page() {
  php -r '
    $response = file_get_contents("http://wp".$argv[2], false, stream_context_create(["http"=>["header"=>"Host: ".$argv[1]."\r\n", "follow_location"=>0, "timeout"=>10]]));
    if ($response===false || !preg_match("~^HTTP/[^ ]+ 200~", $http_response_header[0])) exit(1);
    echo $response;
  ' "$host" "$1"
}
assert_key() {
  html="$(fetch_page "$1")"
  printf '%s' "$html" | grep -Fq "data-key=\"$2\""
  if printf '%s' "$html" | grep -Fq "data-key=\"$3\""; then
    echo "Cross-site key leak" >&2; exit 1
  fi
}
assert_absent() {
  if fetch_page "$1" | grep -Fq 'id="convor-live-chat-js"'; then
    echo "Widget still present on $1" >&2; exit 1
  fi
}
# Fresh or reset network: neither subsite inherits the other's configuration.
for url in "$main" "$second"; do
  wp option delete convor_settings --url="$url" >/dev/null 2>&1 || true
done
assert_absent /
assert_absent /second/
set_key "$main" "$key1"
assert_key / "$key1" "$key2"
assert_absent /second/
set_key "$second" "$key2"
assert_key / "$key1" "$key2"
assert_key /second/ "$key2" "$key1"
wp plugin deactivate convor --network --url="$main"
assert_absent /
assert_absent /second/
wp plugin activate convor --network --url="$main"
assert_key / "$key1" "$key2"
assert_key /second/ "$key2" "$key1"
for url in "$main" "$second"; do
  wp transient set convor_widget_pairing fixture 600 --url="$url"
done
wp plugin deactivate convor --network --url="$main"
wp plugin uninstall convor --url="$main"
for url in "$main" "$second"; do
  result="$(wp eval 'echo (false===get_option("convor_settings") ? "settings-clean" : "settings-left")." ".(false===get_transient("convor_widget_pairing") ? "grant-clean" : "grant-left");' --url="$url")"
  if [ "$result" != "settings-clean grant-clean" ]; then
    echo "Uninstall cleanup on $url: $result" >&2; exit 1
  fi
done
wp plugin install "$zip" --activate-network --url="$main"
assert_absent /
assert_absent /second/
echo "PASS: multisite network activation, subdirectory site isolation, deactivate/reactivate, real deletion, uninstall and ZIP reinstall"
