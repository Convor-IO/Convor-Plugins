#!/usr/bin/env bash
# Real PrestaShop Configuration/Shop isolation on the owned, disposable PS8 fixture.
# This is a platform integration check, not a second SaaS tenant round-trip.
set -euo pipefail
cd "$(dirname "$0")/../../.."
container=convor-prestashop-1807-82-prestashop-1
[[ "$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$container")" == "convor-prestashop-1807-82" ]]
docker exec -i -u www-data "$container" php <<'PHP'
<?php
require '/var/www/html/config/config.inc.php';
require_once '/var/www/html/modules/convor/convor.php';

function check($condition, $message) {
    if (!$condition) {
        throw new RuntimeException($message);
    }
    echo "PASS: $message\n";
}
$context = Context::getContext();
$originalShop = $context->shop;
$originalContext = Shop::getContext();
$originalMulti = Configuration::getGlobalValue('PS_MULTISHOP_FEATURE_ACTIVE');
$shop = new Shop();
$shop->name = 'Convor disposable isolation QA';
$shop->id_category = (int)$originalShop->id_category;
$shop->id_shop_group = (int)$originalShop->id_shop_group;
$shop->theme_name = $originalShop->theme_name;
$shop->active = true;
$shop->deleted = false;
$shopId = 0;
try {
    check($shop->add(), 'create a second real shop');
    $shopId = (int)$shop->id;
    check(Configuration::updateGlobalValue('PS_MULTISHOP_FEATURE_ACTIVE', 1), 'enable multistore');
    // Force a fresh feature check even if PrestaShop initialized its cache before
    // the second shop existed. These are actual platform objects/configuration.
    Shop::resetStaticCache();
    check(Shop::isFeatureActive(), 'real multistore is active');
    $module = Module::getInstanceByName('convor');
    Shop::setContext(Shop::CONTEXT_SHOP, (int)$originalShop->id);
    $context->shop = $originalShop;
    $first = $module->settings();
    check(Convor::validKey($first['widget_key']), 'first shop has a configured public key');
    Shop::setContext(Shop::CONTEXT_SHOP, $shopId);
    $context->shop = $shop;
    check($module->settings()['widget_key'] === '', 'unconfigured shop does not inherit first shop key');
    $second = Convor::defaults();
    $second['widget_key'] = 'convor_wpk_' . str_repeat('b', 64);
    $second['verification_challenge'] = 'qa-second-shop-proof';
    check($module->saveSettings($second), 'write second shop settings');
    check($module->settings()['widget_key'] === $second['widget_key'], 'second shop reads own key');
    check($module->settings()['verification_challenge'] === $second['verification_challenge'], 'second shop reads own proof');
    Shop::setContext(Shop::CONTEXT_SHOP, (int)$originalShop->id);
    $context->shop = $originalShop;
    check($module->settings() === $first, 'first shop remains unchanged');
    // The authenticated back-office policy is covered by the harness and
    // browser acceptance; the CLI itself has no logged-in employee.
} finally {
    Shop::setContext(Shop::CONTEXT_SHOP, (int)$originalShop->id);
    $context->shop = $originalShop;
    if ($shopId > 0) {
        // Delete only the newly-created disposable shop and its scoped values.
        Db::getInstance()->delete('configuration', 'id_shop=' . (int)$shopId);
        if (!$shop->delete()) {
            throw new RuntimeException('Could not remove temporary QA shop');
        }
    }
    Configuration::updateGlobalValue('PS_MULTISHOP_FEATURE_ACTIVE', $originalMulti);
    Shop::resetStaticCache();
    Shop::setContext($originalContext, $originalContext === Shop::CONTEXT_SHOP ? (int)$originalShop->id : null);
}
PHP
