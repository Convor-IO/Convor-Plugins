<?php
if (!defined('_PS_VERSION_')) {
    exit;
}

/** Migrate valid old keys, never copy a global legacy installation into another shop. */
function upgrade_module_1_1_0($module)
{
    if (!$module->registerHook('actionCustomerLogoutBefore')) {
        return false;
    }
    Configuration::loadConfiguration();
    $multishop = Shop::isFeatureActive();
    foreach (Shop::getShops(false, null, true) as $shopId) {
        $shopId = (int) $shopId;
        if (Configuration::hasKey(Convor::SETTINGS, null, null, $shopId)) {
            continue;
        }
        if ($multishop && !Configuration::hasKey('CONVOR_ORG_SLUG', null, null, $shopId)) {
            continue;
        }
        $key = Configuration::get('CONVOR_ORG_SLUG', null, null, $shopId);
        $settings = Convor::defaults();
        $settings['shop_id'] = $shopId;
        $settings['widget_key'] = Convor::validKey($key) ? $key : '';
        $settings['enabled'] = (bool) Configuration::get('CONVOR_ENABLED', null, null, $shopId);
        if (!Configuration::updateValue(Convor::SETTINGS, json_encode($settings, JSON_THROW_ON_ERROR), false, null, $shopId)) {
            return false;
        }
    }
    return true;
}
