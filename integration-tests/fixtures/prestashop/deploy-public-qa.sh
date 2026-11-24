#!/usr/bin/env bash
# Local Docker only. Start the named Cloudflare Tunnel after the private
# fixture is installed and its gateway passes the access-control checks.
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(cd ../../.. && pwd)"
export QA_STATE_DIR="$ROOT/dist/prestashop-public-qa"
umask 077
if [[ ${1:-} == --resume ]]; then
    test -f "$QA_STATE_DIR/.env"
    test -f "$QA_STATE_DIR/qa-admin.htpasswd"
elif [[ $# == 0 ]]; then
    test ! -e "$QA_STATE_DIR"
    test -z "$(docker ps -aq --filter label=com.docker.compose.project=convor-ps-qa-1807)"
    mkdir -p "$QA_STATE_DIR"
    {
        printf "QA_DB_ROOT_PASSWORD=%s\n" "$(openssl rand -hex 32)"
        printf "QA_DB_PASSWORD=%s\n" "$(openssl rand -hex 32)"
        printf "QA_ADMIN_PASSWORD=%s\n" "$(openssl rand -hex 24)"
        printf "QA_GATEWAY_PASSWORD=%s\n" "$(openssl rand -hex 24)"
    } > "$QA_STATE_DIR/.env"
    . "$QA_STATE_DIR/.env"
    printf "reviewer:%s\n" "$(printf "%s" "$QA_GATEWAY_PASSWORD" | openssl passwd -apr1 -stdin)" > "$QA_STATE_DIR/qa-admin.htpasswd"
    chmod 644 "$QA_STATE_DIR/qa-admin.htpasswd"
    unset QA_GATEWAY_PASSWORD QA_ADMIN_PASSWORD QA_DB_ROOT_PASSWORD QA_DB_PASSWORD
else
    echo "Usage: $0 [--resume]" >&2
    exit 2
fi
compose() { docker compose --env-file "$QA_STATE_DIR/.env" -f public-qa.compose.yml "$@"; }
compose up -d db prestashop
deadline=$(( $(date +%s) + 900 ))
restarted=0
until compose exec -T prestashop test -f /var/www/html/app/config/parameters.php >/dev/null 2>&1 &&
    compose exec -T prestashop sh -c 'test ! -d /var/www/html/install && curl -fsS -o /dev/null -H "Host: ps-qa-1807.topsoft4u.com" -H "X-Forwarded-Proto: https" http://127.0.0.1/' >/dev/null 2>&1; do
    if [ "$(date +%s)" -ge "$deadline" ]; then echo "Private shop initialization timed out"; exit 1; fi
    # The upstream entrypoint may remove install/ twice after a successful
    # 9.2.1 install and exit 1. Restart this exact completed fixture once.
    container=convor-ps-qa-1807-prestashop-1
    if [[ "$(docker inspect -f '{{.State.Status}}' "$container")" == exited ]]; then
        [[ "$restarted" == 0 ]] || { echo "Shop exited again"; exit 1; }
        test "$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$container")" = convor-ps-qa-1807
        docker logs "$container" 2>&1 | grep -F -- '-- Installation successful! --' >/dev/null
        docker start "$container" >/dev/null
        restarted=1
    fi
    sleep 5
done
compose exec -T --user www-data prestashop php -r '
require "/var/www/html/config/config.inc.php";
if (_PS_VERSION_ !== "9.2.1" || _PS_MODE_DEV_) exit(1);
Configuration::updateValue("PS_MAIL_METHOD", 3);
Configuration::updateValue("PS_WEBSERVICE", 0);
Configuration::updateValue("PS_SSL_ENABLED", 1);
Configuration::updateValue("PS_SSL_ENABLED_EVERYWHERE", 1);
foreach (["ps_wirepayment", "ps_checkpayment"] as $name) {
    if (Module::isEnabled($name)) {
        $module = Module::getInstanceByName($name);
        if (!$module || !$module->disable()) exit(2);
    }
}
echo "Private synthetic shop configured; payment methods and mail disabled.\n";
'
compose --profile public up -d gateway
compose exec -T gateway nginx -t
for entry in '/ 200' '/admin-dev/ 401' '/install/ 404' '/api/ 404' '/.env 404'; do
    read -r path expected <<< "$entry"
    actual=$(curl -sS --max-time 30 -H 'Host: ps-qa-1807.topsoft4u.com' -o /dev/null -w '%{http_code}' "http://127.0.0.1:18224$path")
    [[ "$actual" == "$expected" ]] || { echo "FAIL $path: $actual (expected $expected)"; exit 1; }
    echo "PASS $path: $actual"
done
echo "PASS local shop gateway. Start the dedicated tunnel with its explicit configuration."
