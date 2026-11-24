<?php
// CLI-only setup/cleanup for the owned PS8.2.9 integration fixture.
if (PHP_SAPI !== 'cli') exit(1);
require '/var/www/html/config/config.inc.php';
require_once '/var/www/html/modules/convor/convor.php';

$action = getenv('CONVOR_QA_MULTISHOP_ACTION');
$name = 'Convor second shop E2E fixture';
$original = new Shop(1);
function cleanupConvorShop($id, $oldMulti, $name) {
    $shop = new Shop((int)$id);
    if (!$shop->id || $shop->name !== $name || (int)$shop->id === 1) throw new RuntimeException('Not the disposable shop');
    Shop::setContext(Shop::CONTEXT_SHOP, 1);
    Context::getContext()->shop = new Shop(1);
    Db::getInstance()->delete('configuration', 'id_shop='.(int)$id);
    foreach (ShopUrl::getShopUrls((int)$id) as $url) {
        if (!$url->delete()) throw new RuntimeException('Could not delete fixture URL');
    }
    if (!$shop->delete()) throw new RuntimeException('Could not delete disposable shop');
    Configuration::updateGlobalValue('PS_MULTISHOP_FEATURE_ACTIVE',(int)$oldMulti);
    Shop::resetStaticCache();
}
if ($action === 'remove') {
    cleanupConvorShop((int)getenv('CONVOR_QA_MULTISHOP_ID'),(int)getenv('CONVOR_QA_MULTISHOP_OLD'),$name);
    echo json_encode(array('removed'=>true));
    exit;
}
if ($action !== 'create') exit(1);
foreach (Shop::getShops(false) as $existing) {
    if ($existing['name'] === $name) throw new RuntimeException('Previous fixture exists; inspect and clean before creating another');
}
$oldMulti = (int)Configuration::getGlobalValue('PS_MULTISHOP_FEATURE_ACTIVE');
$shop = new Shop();
$shop->name=$name;
$shop->id_category=(int)$original->id_category;
$shop->id_shop_group=(int)$original->id_shop_group;
$shop->theme_name=$original->theme_name;
$shop->active=true;
$shop->deleted=false;
if (!$shop->add()) throw new RuntimeException('Cannot create second shop');
$id=(int)$shop->id;
try {
    Configuration::updateGlobalValue('PS_MULTISHOP_FEATURE_ACTIVE',1);
    Shop::resetStaticCache();
    $_POST['categoryBox']=Shop::getCategories(1);
    // Copy normal storefront associations only. Never duplicate API keys,
    // credentials, customer/order records or module-specific config values.
    $tables=array_fill_keys(array_diff(array_keys(Shop::getAssoTables()),array('webservice_account','warehouse')),true);
    $shop->copyShopData(1,$tables);
    $shop->associateSuperAdmins();
    Category::updateFromShop($_POST['categoryBox'],$id);
    $url=new ShopUrl();
    $url->id_shop=$id;
    $proxy = getenv('CONVOR_QA_MULTISHOP_PROXY') === '1';
    $domain = $proxy ? 'localhost:18226' : '127.0.0.1:18218';
    if ($proxy && getenv('CONVOR_QA_MULTISHOP_PROXY_IDN') === '1') {
        $domain = 'xn--sklep-d-q0a42esr.localhost:18226';
    }
    $url->domain=$domain;
    $url->domain_ssl=$domain;
    $url->physical_uri='/';
    $url->virtual_uri=$proxy ? 'convor-qa/' : '';
    $url->main=true;
    $url->active=true;
    if (!$url->add()) throw new RuntimeException('Cannot create second shop URL');
    Shop::resetStaticCache();
    if ($proxy) {
        $module = Module::getInstanceByName('convor');
        $key = $module->settings()['widget_key'];
        if (!Convor::validKey($key)) throw new RuntimeException('Expected synthetic widget key');
        Shop::setContext(Shop::CONTEXT_SHOP, $id);
        Context::getContext()->shop = new Shop($id);
        $settings = Convor::defaults();
        $settings['widget_key'] = $key;
        $settings['enabled'] = true;
        $settings['commerce_context'] = true;
        $settings['consent_required'] = true;
        if (!$module->saveSettings($settings)) throw new RuntimeException('Could not configure temporary proxy shop');
        if (!Tools::generateHtaccess()) throw new RuntimeException('Could not generate virtual shop routes');
    }
    echo json_encode(array('shopId'=>$id,'oldMulti'=>$oldMulti),JSON_THROW_ON_ERROR);
} catch(Throwable $e) {
    cleanupConvorShop($id,$oldMulti,$name);
    throw $e;
}
