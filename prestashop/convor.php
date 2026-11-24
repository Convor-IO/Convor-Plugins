<?php
/**
 * Convor Live Chat for PrestaShop.
 *
 * @package Convor
 */
if (!defined('_PS_VERSION_')) {
    exit;
}

require_once __DIR__ . '/classes/ConvorVisitorSession.php';

class Convor extends Module
{
    const VERSION = '1.1.0';
    const SETTINGS = 'CONVOR_WIDGET_SETTINGS';
    const DEFAULT_CDN = 'https://cdn.convor.io';
    const DEFAULT_API = 'https://api.convor.io';
    const DEFAULT_DASHBOARD = 'https://dashboard.convor.io';
    const PAIRING_COOKIE = 'convor_pairing';
    const PAIRING_TTL = 600;

    private $headerRendered = false;

    public function __construct()
    {
        $this->name = 'convor';
        $this->tab = 'front_office_features';
        $this->version = self::VERSION;
        $this->author = 'Convor';
        $this->need_instance = 0;
        $this->bootstrap = true;
        // The package release matrix, not the installed runtime, defines the range.
        $this->ps_versions_compliancy = array('min' => '8.2.9', 'max' => '9.2.1');
        parent::__construct();
        $this->displayName = $this->l('Convor Live Chat');
        $this->description = $this->l('Add Convor live chat to your storefront.');
        $this->confirmUninstall = $this->l('Remove Convor and its settings?');
    }

    public function install()
    {
        if (!parent::install()) {
            return false;
        }
        if (!$this->registerHook('displayHeader') || !$this->registerHook('actionCustomerLogoutBefore')) {
            parent::uninstall();
            return false;
        }
        return true;
    }

    public function uninstall()
    {
        if (!parent::uninstall()) {
            return false;
        }
        return Configuration::deleteByName(self::SETTINGS)
            && Configuration::deleteByName('CONVOR_ENABLED')
            && Configuration::deleteByName('CONVOR_ORG_SLUG')
            && Configuration::deleteByName('CONVOR_API_BASE');
    }

    public static function validKey($value)
    {
        return is_string($value) && preg_match('/\Aconvor_wpk_[a-f0-9]{64}\z/', $value) === 1;
    }

    public static function validChallenge($value)
    {
        return is_string($value) && preg_match('/\A[A-Za-z0-9_-]{1,256}\z/', $value) === 1;
    }

    /**
     * Deployment overrides are server constants, never merchant form fields.
     * A local fixture may define them before loading the module. The default
     * package always uses the official HTTPS endpoints.
     */
    public static function endpoint($type)
    {
        $endpoints = array(
            'cdn' => array('CONVOR_PRESTASHOP_CDN_BASE', self::DEFAULT_CDN),
            'api' => array('CONVOR_PRESTASHOP_API_BASE', self::DEFAULT_API),
            'dashboard' => array('CONVOR_PRESTASHOP_DASHBOARD_BASE', self::DEFAULT_DASHBOARD),
        );
        if (!isset($endpoints[$type])) {
            return '';
        }
        list($constant, $default) = $endpoints[$type];
        if (!defined($constant)) {
            return $default;
        }
        $value = constant($constant);
        if (!is_string($value) || $value === '') {
            return '';
        }
        $value = rtrim($value, '/');
        if ($value === $default) {
            return $value;
        }
        // Only the explicitly enabled, disposable loopback fixture may
        // override the production origins. No arbitrary staging redirects,
        // credentials, query strings, fragments or remote HTTP endpoints.
        if (defined('CONVOR_PRESTASHOP_LOCAL_QA') && CONVOR_PRESTASHOP_LOCAL_QA === true) {
            $local = array(
                'cdn' => array('http://localhost:17243', 'http://127.0.0.1:17243'),
                'api' => array('http://server:3000', 'http://localhost:17243', 'http://127.0.0.1:17243'),
                'dashboard' => array('http://localhost:17244', 'http://127.0.0.1:17244'),
            );
            if (in_array($value, $local[$type], true)) {
                return $value;
            }
        }
        // Do not silently fall back to production on invalid QA configuration.
        return '';
    }

    private static function websiteName($value)
    {
        return is_string($value) && strlen($value) <= 512 && !preg_match('/[\x00-\x1f\x7f]/', $value)
            ? trim($value) : '';
    }

    public static function defaults()
    {
        return array(
            'enabled' => true,
            'widget_key' => '',
            'website_name' => '',
            'verification_challenge' => '',
            'consent_required' => false,
            'exclude_checkout' => false,
            'commerce_context' => false,
            'identity_enabled' => false,
            'identity_secret' => '',
        );
    }

    public function shopId()
    {
        return (int) ($this->context->shop->id ?? 0);
    }

    private function shopGroupId()
    {
        return (int) ($this->context->shop->id_shop_group ?? 0);
    }

    public function settings()
    {
        $shop = $this->shopId();
        if ($shop <= 0) {
            return self::defaults();
        }
        // get() initializes PrestaShop's cache; hasKey checks the exact shop
        // rather than its usual group/global inheritance.
        $raw = Configuration::get(self::SETTINGS, null, $this->shopGroupId(), $shop);
        $settings = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($settings)) {
            return self::defaults();
        }
        if (Shop::isFeatureActive()
            && !Configuration::hasKey(self::SETTINGS, null, null, $shop)
            && (int) ($settings['shop_id'] ?? 0) !== $shop) {
            return self::defaults();
        }
        if (isset($settings['shop_id']) && (int) $settings['shop_id'] !== $shop) {
            return self::defaults();
        }
        return array_replace(self::defaults(), $settings);
    }

    public function saveSettings(array $settings, $expectedDigest = null)
    {
        $shop = $this->shopId();
        if ($shop <= 0) {
            return false;
        }
        // Serialize module-owned writes, then compare the current settings.
        // Do not hold the lock while calling the remote pairing endpoint.
        $db = Db::getInstance();
        $lock = 'convor_ps_' . sha1(_DB_NAME_ . ':' . _DB_PREFIX_ . ':' . $shop);
        if ((int) $db->getValue("SELECT GET_LOCK('" . $lock . "', 3)", false) !== 1) {
            return false;
        }
        try {
            Configuration::loadConfiguration();
            if ($expectedDigest !== null && !hash_equals($expectedDigest, $this->settingsDigest())) {
                return false;
            }
            $settings['shop_id'] = $shop;
            return Configuration::updateValue(
                self::SETTINGS,
                json_encode($settings, JSON_THROW_ON_ERROR),
                false,
                $this->shopGroupId(),
                $shop
            );
        } finally {
            $db->getValue("SELECT RELEASE_LOCK('" . $lock . "')", false);
        }
    }

    public function hookDisplayHeader($params)
    {
        $settings = $this->settings();
        if ($this->headerRendered || empty($settings['enabled']) || !self::validKey($settings['widget_key'])) {
            return '';
        }
        $page = (string) ($this->context->controller->php_self ?? '');
        if (!empty($settings['exclude_checkout']) && in_array($page, array('order', 'order-confirmation', 'order-opc'), true)) {
            return '';
        }
        $challenge = self::validChallenge($settings['verification_challenge']) ? $settings['verification_challenge'] : '';
        $base = self::endpoint('cdn');
        if ($base === '') {
            return '';
        }
        $cdn = $base . '/widget.js';
        $deferred = !empty($settings['consent_required']) || !empty($settings['commerce_context']) || !empty($settings['identity_enabled']);
        $this->context->smarty->assign(array(
            'convor_key' => $settings['widget_key'],
            'convor_challenge' => $challenge,
            'convor_src' => $deferred ? __PS_BASE_URI__ . 'modules/convor/views/js/consent.js' : $cdn,
            'convor_deferred_src' => $deferred ? $cdn : '',
            'convor_consent_required' => !empty($settings['consent_required']) ? '1' : '',
            'convor_identity' => !empty($settings['identity_enabled']) ? '1' : '',
            'convor_context' => !empty($settings['commerce_context']) || !empty($settings['identity_enabled'])
                ? __PS_BASE_URI__ . 'index.php?fc=module&module=convor&controller=context' : '',
            'convor_product' => $page === 'product' ? (int) Tools::getValue('id_product') : 0,
        ));
        $html = $this->display(__FILE__, 'views/templates/hook/header.tpl');
        $this->headerRendered = true;
        return $html;
    }

    public function identitySecret(array $settings)
    {
        if (empty($settings['identity_enabled']) || !self::validKey($settings['widget_key'])) {
            return '';
        }
        return ConvorVisitorSession::decrypt($settings['identity_secret'], $this->shopId(), $settings['widget_key']);
    }

    /** A previous customer session must not mint fresh Convor visitor tokens after logout. */
    public function hookActionCustomerLogoutBefore($params)
    {
        $state = ConvorVisitorSession::read($this->context->cookie);
        $settings = $this->settings();
        if (!$state || $state['shopId'] !== $this->shopId()
            || $state['widgetKey'] !== $settings['widget_key']) {
            return;
        }
        ConvorVisitorSession::clear($this->context->cookie);
        $this->revokeVisitorSession($state['widgetKey'], $state['handle']);
    }

    public function revokeVisitorSession($widgetKey, $handle)
    {
        if (!self::validKey($widgetKey) || !ConvorVisitorSession::validHandle($handle)) {
            return;
        }
        $api = self::endpoint('api');
        if ($api === '') {
            return;
        }
        $curl = curl_init($api . '/api/auth/visitor-reset');
        if ($curl === false) {
            return;
        }
        try {
            $parts = parse_url($this->context->link->getBaseLink($this->shopId()));
            $origin = ($parts['scheme'] ?? '') . '://' . ($parts['host'] ?? '')
                . (isset($parts['port']) ? ':' . $parts['port'] : '');
            curl_setopt_array($curl, array(
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => json_encode(array('key' => $widgetKey, 'visitorHandle' => $handle), JSON_THROW_ON_ERROR),
                CURLOPT_HTTPHEADER => array('Content-Type: application/json', 'Origin: ' . $origin),
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_CONNECTTIMEOUT_MS => 300,
                CURLOPT_TIMEOUT_MS => 900,
                CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            ));
            curl_exec($curl);
        } finally {
            curl_close($curl);
        }
    }

    public function canConfigure()
    {
        return $this->shopId() > 0
            && (!Shop::isFeatureActive() || Shop::getContext() === Shop::CONTEXT_SHOP)
            && isset($this->context->employee)
            && $this->context->employee->isLoggedBack()
            && $this->getPermission('configure', $this->context->employee);
    }

    private function authorizedPost()
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST' || !$this->canConfigure()) {
            return false;
        }
        // Symfony masks the same CSRF secret differently on each request.
        // Its token manager validates the submitted token, not its current mask.
        $managerClass = 'PrestaShopBundle\\Security\\Admin\\UserTokenManager';
        if (class_exists($managerClass) && class_exists('PrestaShop\\PrestaShop\\Adapter\\SymfonyContainer')) {
            $container = \PrestaShop\PrestaShop\Adapter\SymfonyContainer::getInstance();
            if ($container && $container->has($managerClass)) {
                return $container->get($managerClass)->isTokenValid();
            }
        }
        // Legacy back office uses a stable per-employee controller token.
        $token = Tools::getValue('token');
        $expected = Tools::getAdminTokenLite('AdminModules');
        return is_string($token) && is_string($expected) && $expected !== ''
            && hash_equals($expected, $token);
    }

    public function getContent()
    {
        if (!$this->canConfigure()) {
            return $this->displayError($this->l('Select one shop and sign in with permission to configure this module.'));
        }
        $output = '';
        if (Tools::isSubmit('submitConvorSettings') || Tools::isSubmit('submitConvorPairStart')
            || Tools::isSubmit('submitConvorPairComplete')) {
            if (!$this->authorizedPost()) {
                return $this->displayError($this->l('Your session has expired. Reload the page and try again.'));
            }
            if (Tools::isSubmit('submitConvorSettings')) {
                $output = $this->processSettings();
            } elseif (Tools::isSubmit('submitConvorPairStart')) {
                $output = $this->startPairing();
            } else {
                $output = $this->completePairing();
            }
        }
        return $output . $this->renderPairing() . $this->renderForm();
    }

    private function processSettings()
    {
        $key = Tools::getValue('CONVOR_WIDGET_KEY', '');
        $challenge = Tools::getValue('CONVOR_VERIFICATION_CHALLENGE', '');
        if (!is_string($key) || !is_string($challenge)) {
            return $this->displayError($this->l('Invalid widget settings.'));
        }
        $key = trim($key);
        $challenge = trim($challenge);
        if (($key !== '' && !self::validKey($key)) || ($challenge !== '' && !self::validChallenge($challenge))) {
            return $this->displayError($this->l('Enter a valid public widget key and verification challenge.'));
        }
        $previous = $this->settings();
        // Never reuse a proof issued for a previous site's public key.
        if ($previous['widget_key'] !== '' && $previous['widget_key'] !== $key
            && $previous['verification_challenge'] === $challenge) {
            $challenge = '';
        }
        if ($key === '') {
            $challenge = '';
        }
        $identityEnabled = Tools::getValue('CONVOR_IDENTITY_ENABLED') === '1';
        $identitySecret = Tools::getValue('CONVOR_IDENTITY_SECRET', '');
        $encrypted = '';
        if (!is_string($identitySecret)) {
            return $this->displayError($this->l('Invalid identity verification secret.'));
        }
        if ($identityEnabled) {
            if ($key === '') {
                return $this->displayError($this->l('Enter a valid identity verification secret for this website.'));
            }
            if ($identitySecret !== '') {
                $encrypted = ConvorVisitorSession::encrypt(trim($identitySecret), $this->shopId(), $key);
            } elseif ($previous['widget_key'] === $key && $this->identitySecret($previous) !== '') {
                $encrypted = $previous['identity_secret'];
            }
            if ($encrypted === '') {
                return $this->displayError($this->l('Enter a valid identity verification secret for this website.'));
            }
        }
        $next = array(
            'identity_enabled' => $identityEnabled,
            'identity_secret' => $encrypted,
            'enabled' => Tools::getValue('CONVOR_ENABLED') === '1',
            'widget_key' => $key,
            'website_name' => $previous['widget_key'] === $key && $key !== '' ? self::websiteName($previous['website_name']) : '',
            'verification_challenge' => $challenge,
            'consent_required' => Tools::getValue('CONVOR_CONSENT_REQUIRED') === '1',
            'exclude_checkout' => Tools::getValue('CONVOR_EXCLUDE_CHECKOUT') === '1',
            'commerce_context' => Tools::getValue('CONVOR_COMMERCE_CONTEXT') === '1',
        );
        if (!$this->saveSettings($next)) {
            return $this->displayError($this->l('Could not save settings. Please try again.'));
        }
        $this->clearPairing();
        return $this->displayConfirmation($this->l('Settings saved. Open your storefront and send a test message.'));
    }

    private function settingsDigest()
    {
        return hash('sha256', json_encode($this->settings(), JSON_THROW_ON_ERROR));
    }

    private function clearPairing()
    {
        unset($this->context->cookie->{self::PAIRING_COOKIE});
        $this->context->cookie->write();
    }

    private function pendingPairing()
    {
        $encoded = $this->context->cookie->{self::PAIRING_COOKIE} ?? '';
        $raw = is_string($encoded) ? base64_decode($encoded, true) : false;
        $grant = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($grant) || ($grant['expires'] ?? 0) <= time()
            || ($grant['shop'] ?? null) !== $this->shopId()
            || ($grant['employee'] ?? null) !== (int) $this->context->employee->id
            || !isset($grant['state'], $grant['verifier'], $grant['callback'], $grant['site'], $grant['digest'])) {
            return null;
        }
        return $grant;
    }

    private function startPairing()
    {
        if (self::endpoint('dashboard') === '' || self::endpoint('api') === '') {
            return $this->displayError($this->l('The Convor service configuration is invalid. Contact your store administrator.'));
        }
        $site = rtrim($this->context->link->getBaseLink($this->shopId()), '/') . '/';
        $parts = parse_url($site);
        $local = isset($parts['host']) && in_array($parts['host'], array('localhost', '127.0.0.1'), true)
            && defined('CONVOR_PRESTASHOP_LOCAL_QA') && CONVOR_PRESTASHOP_LOCAL_QA === true;
        if (!$parts || (($parts['scheme'] ?? '') !== 'https' && !$local)
            || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])) {
            return $this->displayError($this->l('Use HTTPS to connect your store, or enter the public widget key manually.'));
        }
        $grant = array(
            'state' => bin2hex(random_bytes(32)),
            'verifier' => bin2hex(random_bytes(32)),
            'callback' => $site . 'index.php?fc=module&module=convor&controller=pairing',
            'site' => $site,
            'digest' => $this->settingsDigest(),
            'shop' => $this->shopId(),
            'employee' => (int) $this->context->employee->id,
            'expires' => time() + self::PAIRING_TTL,
        );
        // The platform's authenticated/encrypted back-office cookie never
        // sends the verifier or BO token to Convor or the public controller.
        $this->context->cookie->{self::PAIRING_COOKIE} = base64_encode(json_encode($grant, JSON_THROW_ON_ERROR));
        $this->context->cookie->write();
        return '';
    }

    private function redeem($grant, $code)
    {
        $base = self::endpoint('api');
        if ($base === '') {
            return null;
        }
        $url = $base . '/api/prestashop/pairing/redeem';
        $curl = curl_init($url);
        if ($curl === false) {
            return null;
        }
        try {
            curl_setopt_array($curl, array(
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => json_encode(array(
                    'code' => $code,
                    'state' => $grant['state'],
                    'verifier' => $grant['verifier'],
                    'callback' => $grant['callback'],
                ), JSON_THROW_ON_ERROR),
                CURLOPT_HTTPHEADER => array('Content-Type: application/json', 'Accept: application/json'),
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_CONNECTTIMEOUT => 5,
                CURLOPT_TIMEOUT => 10,
                CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            ));
            $body = curl_exec($curl);
            if (curl_getinfo($curl, CURLINFO_HTTP_CODE) !== 200 || !is_string($body)) {
                return null;
            }
            $result = json_decode($body, true);
            if (!is_array($result) || !self::validKey($result['widgetKey'] ?? null)) {
                return null;
            }
            return array('key' => $result['widgetKey'], 'name' => self::websiteName($result['websiteName'] ?? ''));
        } finally {
            curl_close($curl);
        }
    }

    private function completePairing()
    {
        $grant = $this->pendingPairing();
        $code = Tools::getValue('CONVOR_PAIR_CODE', '');
        $state = Tools::getValue('CONVOR_PAIR_STATE', '');
        if (!$grant || !is_string($code) || preg_match('/\A[A-Za-z0-9_-]{32}\z/', $code) !== 1
            || !is_string($state) || !hash_equals($grant['state'], $state)
            || !hash_equals($grant['digest'], $this->settingsDigest())) {
            $this->clearPairing();
            return $this->displayError($this->l('The connection expired or the shop settings changed. Start again.'));
        }
        // Only the authenticated administrator can redeem. The public return
        // page is merely a browser relay and never writes configuration.
        $this->clearPairing();
        $website = $this->redeem($grant, $code);
        if ($website === null) {
            return $this->displayError($this->l('Could not connect to Convor. Start again or enter the public widget key.'));
        }
        $key = $website['key'];
        $settings = $this->settings();
        if ($settings['widget_key'] !== $key) {
            $settings['verification_challenge'] = '';
            $settings['identity_enabled'] = false;
            $settings['identity_secret'] = '';
        }
        $settings['widget_key'] = $key;
        $settings['website_name'] = $website['name'];
        $settings['enabled'] = true;
        if (!$this->saveSettings($settings, $grant['digest'])) {
            return $this->displayError($this->l('The connection expired or the shop settings changed. Start again.'));
        }
        return $this->displayConfirmation($this->l('Public widget key saved. Open your storefront and send a test message.'));
    }

    private function configureUrl()
    {
        // PS 8's Symfony configure action redirects to the legacy controller,
        // dropping POST data. Submit straight to the legacy BO on PS 8.
        // PS 9 handles configuration in the Symfony controller itself.
        if ($this->context->link && version_compare(_PS_VERSION_, '9.0.0', '<')) {
            return $this->context->link->getAdminLink('AdminModules', true, array(),
                array('configure' => $this->name));
        }
        if ($this->context->link) {
            return $this->context->link->getAdminLink('AdminModules', true,
                array('route' => 'admin_module_configure_action', 'module_name' => $this->name));
        }
        return AdminController::$currentIndex . '&configure=' . $this->name;
    }

    private function renderPairing()
    {
        $pending = $this->pendingPairing();
        $url = '';
        if ($pending && self::endpoint('dashboard') !== '' && self::endpoint('api') !== '') {
            $url = self::endpoint('dashboard') . '/integrations/prestashop?' . http_build_query(array(
                'ps_site' => $pending['site'],
                'ps_callback' => $pending['callback'],
                'ps_state' => $pending['state'],
                'ps_proof' => hash('sha256', $pending['verifier']),
            ), '', '&', PHP_QUERY_RFC3986);
        }
        $settings = $this->settings();
        $this->context->smarty->assign(array(
            'convor_pair_url' => $url,
            'convor_pair_state' => $pending ? $pending['state'] : '',
            'convor_pair_action' => $this->configureUrl(),
            'convor_pair_token' => Tools::getAdminTokenLite('AdminModules'),
            'convor_pair_script' => __PS_BASE_URI__ . 'modules/convor/views/js/pairing-admin.js',
            'convor_has_key' => self::validKey($settings['widget_key']),
            'convor_enabled' => !empty($settings['enabled']),
            'convor_website_name' => self::websiteName($settings['website_name']),
            'convor_storefront_url' => $this->context->link ? $this->context->link->getBaseLink($this->shopId()) : '',
            'convor_guide_url' => 'https://convor.io/' . (($this->context->language->iso_code ?? '') === 'pl' ? 'pl' : 'en') . '/docs/integrations/prestashop-integration',
        ));
        return $this->display(__FILE__, 'views/templates/admin/pairing.tpl');
    }

    private function switchField($name, $label, $description)
    {
        return array(
            'type' => 'switch',
            'name' => $name,
            'label' => $label,
            'desc' => $description,
            'is_bool' => true,
            'values' => array(
                array('id' => strtolower($name) . '_on', 'value' => 1, 'label' => $this->l('Yes')),
                array('id' => strtolower($name) . '_off', 'value' => 0, 'label' => $this->l('No')),
            ),
        );
    }

    private function renderForm()
    {
        $settings = $this->settings();
        $fields = array(
            'form' => array(
                'legend' => array('title' => $this->displayName, 'icon' => 'icon-comments'),
                'input' => array(
                    $this->switchField('CONVOR_ENABLED', $this->l('Enable Convor on the storefront'), $this->l('Turn chat off without deleting its settings.')),
                    array(
                        'type' => 'text',
                        'name' => 'CONVOR_WIDGET_KEY',
                        'label' => $this->l('Public widget key'),
                        'desc' => $this->l('Copy the public widget key from the selected website in Convor. It starts with convor_wpk_.'),
                    ),
                    array(
                        'type' => 'text',
                        'name' => 'CONVOR_VERIFICATION_CHALLENGE',
                        'label' => $this->l('Verification challenge (optional)'),
                        'desc' => $this->l('If Convor requests website verification, copy the data-convor-verification value here. Clear it after verification.'),
                    ),
                    $this->switchField('CONVOR_CONSENT_REQUIRED', $this->l('Wait for consent before loading Convor'), $this->l('Requires a consent manager integration. Without consent, no Convor request is made.')),
                    $this->switchField('CONVOR_EXCLUDE_CHECKOUT', $this->l('Hide chat during checkout'), $this->l('Hide chat on checkout and order confirmation pages.')),
                    $this->switchField('CONVOR_COMMERCE_CONTEXT', $this->l('Share product and cart context'), $this->l('Share the current product and cart subtotal with the conversation. Customer details and orders are not sent.')),
                    $this->switchField('CONVOR_IDENTITY_ENABLED', $this->l('Verify signed-in customers'), $this->l('Send a pseudonymous, verified customer identifier. Keep each login session separate.')),
                    array(
                        'type' => 'password',
                        'name' => 'CONVOR_IDENTITY_SECRET',
                        'label' => $this->l('Identity verification secret'),
                        'desc' => $this->l('Create the secret in the selected Convor website settings. Leave blank to keep the existing secret for this website.'),
                    ),
                ),
                'submit' => array('title' => $this->l('Save settings')),
            ),
        );
        $helper = new HelperForm();
        $helper->module = $this;
        $helper->name_controller = $this->name;
        $helper->token = Tools::getAdminTokenLite('AdminModules');
        $helper->currentIndex = $this->configureUrl();
        $helper->default_form_language = (int) Configuration::get('PS_LANG_DEFAULT');
        $helper->show_toolbar = false;
        $helper->submit_action = 'submitConvorSettings';
        $helper->tpl_vars = array('fields_value' => array(
            'CONVOR_ENABLED' => (int) $settings['enabled'],
            'CONVOR_WIDGET_KEY' => (string) $settings['widget_key'],
            'CONVOR_VERIFICATION_CHALLENGE' => (string) $settings['verification_challenge'],
            'CONVOR_CONSENT_REQUIRED' => (int) $settings['consent_required'],
            'CONVOR_EXCLUDE_CHECKOUT' => (int) $settings['exclude_checkout'],
            'CONVOR_COMMERCE_CONTEXT' => (int) $settings['commerce_context'],
            'CONVOR_IDENTITY_ENABLED' => (int) $settings['identity_enabled'],
            'CONVOR_IDENTITY_SECRET' => '',
        ));
        return $helper->generateForm(array($fields));
    }
}
