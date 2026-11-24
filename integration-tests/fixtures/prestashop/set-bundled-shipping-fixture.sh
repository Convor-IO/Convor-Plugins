#!/usr/bin/env bash
# Reproducible PS9.0.3 core checkout fixture, not a merchant remediation.
# The distribution bundles psshipping 2.0.9: observed HTTP400 independently
# of Convor, HTTP200 after disabling this unconfigured optional provider.
set -euo pipefail
case "${1:-}" in disable|enable) action=$1 ;; *) exit 2 ;; esac
container=convor-prestashop-1807-90-prestashop-1
test "$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$container")" = convor-prestashop-1807-90
docker exec -u www-data "$container" php -r 'require "/var/www/html/config/config.inc.php";$m=Module::getInstanceByName("psshipping");if(_PS_VERSION_!=="9.0.3"||!$m||$m->version!=="2.0.9")exit(1);'
docker exec -u www-data "$container" php /var/www/html/bin/console --env=prod prestashop:module "$action" psshipping --no-interaction
expected=0
if [[ "$action" == enable ]]; then expected=1; fi
actual=$(docker exec -u www-data "$container" php -r 'require "/var/www/html/config/config.inc.php";Tools::clearSmartyCache();echo (int)Module::isEnabled("psshipping");')
test "$actual" = "$expected"
echo "PASS owned PS9.0.3 psshipping 2.0.9 $action"
