<?php
/** Test-only PrestaShop boundary shims; never included in the ZIP. */
declare(strict_types=1);
$scenario = json_decode(getenv('CONVOR_TEST_SCENARIO') ?: '{}', true, 512, JSON_THROW_ON_ERROR);
define('_PS_VERSION_', $scenario['version'] ?? '9.2.1');
foreach (($scenario['endpoints'] ?? array()) as $type => $url) {
    if (!in_array($type, array('cdn','api','dashboard'), true)) throw new RuntimeException('Unknown fixture type');
    define('CONVOR_PRESTASHOP_' . strtoupper($type) . '_BASE', $url);
}
if (!empty($scenario['localQa'])) define('CONVOR_PRESTASHOP_LOCAL_QA', true);
define('__PS_BASE_URI__', '/');
define('_DB_NAME_', 'test');
define('_DB_PREFIX_', 'ps_');
error_reporting(E_ALL & ~E_DEPRECATED);
class FakeSmarty
{
    private $vars = array();
    public function assign($values) { $this->vars = $values; }
    public function render($file)
    {
        $src = file_get_contents($file);
        $src = preg_replace_callback('/{if isset\(\$(\w+)\) && \$\w+}(.*?){\/if}/s', function ($m) {
            return !empty($this->vars[$m[1]]) ? $m[2] : '';
        }, $src);
        $src = preg_replace('/{\*.*?\*}/s', '', $src);
        return preg_replace_callback('/{\$(\w+)(?:\|[^}]*)?}/', function ($m) {
            return htmlspecialchars((string) ($this->vars[$m[1]] ?? ''), ENT_QUOTES, 'UTF-8');
        }, $src);
    }
}
class Shop
{
    const CONTEXT_SHOP = 4;
    const CONTEXT_GROUP = 2;
    public static function isFeatureActive() { return true; }
    public static function getContext() { return !empty($GLOBALS['scenario']['groupContext']) ? self::CONTEXT_GROUP : self::CONTEXT_SHOP; }
}
class Db {
    public static function getInstance() { return new self(); }
    public function getValue($sql, $cache = true) { return 1; }
}
class Configuration
{
    public static function loadConfiguration() {}
    public static function hasKey($key, $idLang = null, $group = null, $shop = null) {
        if ($key === 'CONVOR_WIDGET_SETTINGS') return isset($GLOBALS['scenario']['settings'][$shop]);
        return isset($GLOBALS['scenario']['legacy'][$key]);
    }
    public static function get($key, $idLang = null, $group = null, $shop = null) {
        if ($key === 'CONVOR_WIDGET_SETTINGS') {
            $settings = $GLOBALS['scenario']['settings'][$shop] ?? null;
            return $settings === null ? false : json_encode($settings);
        }
        return $GLOBALS['scenario']['legacy'][$key] ?? false;
    }
    public static function updateValue($key, $value, $html = false, $group = null, $shop = null) {
        if ($key === 'CONVOR_WIDGET_SETTINGS') $GLOBALS['scenario']['settings'][$shop] = json_decode($value, true);
        else $GLOBALS['scenario']['legacy'][$key] = $value;
        return true;
    }
    public static function deleteByName($key) { return true; }
}
class Tools
{
    public static function isSubmit($key) { return isset($_POST[$key]); }
    public static function getValue($key, $default = false) { return $_POST[$key] ?? $default; }
    public static function getAdminTokenLite($key) { return !empty($GLOBALS['scenario']['maskedToken']) ? 'next-mask' : 'test-csrf'; }
}
class FakeUserTokenManager {
    public function isTokenValid() { return ($_POST['token'] ?? '') === 'previous-mask'; }
}
class FakeSymfonyContainer {
    public static function getInstance() { return new self(); }
    public function has($name) { return $name === 'PrestaShopBundle\\Security\\Admin\\UserTokenManager'; }
    public function get($name) { return new FakeUserTokenManager(); }
}
if (!empty($scenario['maskedToken'])) {
    class_alias(FakeSymfonyContainer::class, 'PrestaShop\\PrestaShop\\Adapter\\SymfonyContainer');
    class_alias(FakeUserTokenManager::class, 'PrestaShopBundle\\Security\\Admin\\UserTokenManager');
}
class FakeAdminLink {
    public function getBaseLink($shop) { return 'https://shop.example.test/'; }
    public function getAdminLink($controller, $token, $route = array(), $params = array()) {
        if (!empty($route['route'])) return '/admin/index.php/improve/modules/manage/action/configure/convor?_token=fixture';
        return '/admin/index.php?controller=AdminModules&configure=convor&token=test-csrf';
    }
}
class HelperForm
{
    public function generateForm($forms) {
        $GLOBALS['scenario']['formAction'] = $this->currentIndex;
        return '';
    }
}
class AdminController { public static $currentIndex = 'index.php?controller=AdminModules'; }
class FakeCookie { public function write() {} }
class Employee {
    public $id = 1;
    public function isLoggedBack() { return true; }
}
class Module
{
    public $context;
    public function __construct() {
        $this->context = (object) array(
            'smarty' => new FakeSmarty(),
            'shop' => (object) array('id' => $GLOBALS['scenario']['shop'] ?? 1, 'id_shop_group' => 1),
            'controller' => (object) array('php_self' => $GLOBALS['scenario']['page'] ?? 'index'),
            'employee' => new Employee(),
            'cookie' => new FakeCookie(),
            'link' => !empty($GLOBALS['scenario']['routeTest']) ? new FakeAdminLink() : null,
        );
    }
    public function install() { return true; }
    public function uninstall() { return true; }
    public function registerHook($hook) { return true; }
    public function getPermission($permission, $employee = null) { return true; }
    public function display($file, $template) {
        return strpos($template, '/admin/') !== false ? '' : $this->context->smarty->render(dirname($file) . '/' . $template);
    }
    public function l($value) { return $value; }
    public function displayError($value) { return $value; }
    public function displayConfirmation($value) { return $value; }
}
require_once dirname(__DIR__) . '/prestashop/convor.php';
$module = new Convor();
if (isset($scenario['post'])) {
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $_POST = array('submitConvorSettings' => '1', 'token' => !empty($scenario['invalidToken']) ? 'bad' : (!empty($scenario['maskedToken']) ? 'previous-mask' : 'test-csrf'));
    foreach ($scenario['post'] as $key => $value) $_POST['CONVOR_' . strtoupper($key)] = $value;
    $module->getContent();
}
if (!empty($scenario['routeTest'])) $module->getContent();
$html = $module->hookDisplayHeader(array());
echo json_encode(array('html' => $html, 'repeatHtml' => $module->hookDisplayHeader(array()), 'settings' => $scenario['settings'], 'formAction' => $scenario['formAction'] ?? null,
    'endpoints' => array('cdn'=>Convor::endpoint('cdn'), 'api'=>Convor::endpoint('api'), 'dashboard'=>Convor::endpoint('dashboard'))));
