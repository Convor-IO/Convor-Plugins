<?php
/**
 * Convor Live Chat — PrestaShop module.
 *
 * Injects the Convor widget script tag into the storefront header. The merchant
 * configures their organization slug (and, optionally, an apiBase override) on
 * the module's configuration page; all appearance settings live server-side in
 * the Convor dashboard.
 *
 * @package Convor
 */
if (!defined('_PS_VERSION_')) {
    exit;
}

class Convor extends Module
{
    /**
     * Default widget CDN base URL. Can be overridden per-install via the
     * CONVOR_API_BASE configuration key.
     */
    const DEFAULT_API_BASE = 'https://cdn.convor.io';

    /**
     * Module version.
     */
    const VERSION = '1.0.0';

    /**
     * Initialise the module metadata.
     */
    public function __construct()
    {
        $this->name = 'convor';
        $this->tab = 'front_office_features';
        $this->version = self::VERSION;
        $this->author = 'Convor';
        $this->need_instance = 0;
        $this->bootstrap = true;

        $this->ps_versions_compliancy = array('min' => '1.7.0.0', 'max' => _PS_VERSION_);

        parent::__construct();

        $this->displayName = $this->l('Convor Live Chat');
        $this->description = $this->l('Add the Convor live-chat widget to your store. Enter your organization slug and you are live.');
        $this->confirmUninstall = $this->l('Are you sure you want to remove Convor Live Chat and its settings?');
    }

    /**
     * Install the module and register the storefront header hook.
     *
     * @return bool
     */
    public function install()
    {
        return parent::install()
            && $this->registerHook('displayHeader');
    }

    /**
     * Uninstall the module and clean up its configuration keys.
     *
     * @return bool
     */
    public function uninstall()
    {
        return parent::uninstall()
            && Configuration::deleteByName('CONVOR_ENABLED')
            && Configuration::deleteByName('CONVOR_ORG_SLUG')
            && Configuration::deleteByName('CONVOR_API_BASE');
    }

    /**
     * Render the widget <script> tag into the storefront header.
     *
     * Skipped entirely (returns an empty string) when:
     *  - the module is disabled in its settings, or
     *  - the organization slug is empty.
     *
     * @param array $params Hook parameters (unused).
     *
     * @return string HTML markup to inject into the <head>.
     */
    public function hookDisplayHeader($params)
    {
        if (!Configuration::get('CONVOR_ENABLED')) {
            return '';
        }

        $slug = Configuration::get('CONVOR_ORG_SLUG');
        if (empty($slug)) {
            return '';
        }

        $api_base = Configuration::get('CONVOR_API_BASE');
        if (empty($api_base)) {
            $api_base = self::DEFAULT_API_BASE;
        }

        // Normalise: no trailing slash, scheme + host only.
        $api_base = rtrim($api_base, '/');

        $this->context->smarty->assign(array(
            'convor_slug'     => (string) $slug,
            'convor_api_base' => $api_base,
        ));

        return $this->display(__FILE__, 'views/templates/hook/header.tpl');
    }

    /**
     * Admin configuration page entry point.
     *
     * Handles the form POST (validation + persistence) and then renders the
     * configuration form.
     *
     * @return string HTML for the configuration page.
     */
    public function getContent()
    {
        $output = $this->postProcess();

        return $output . $this->renderForm();
    }

    /**
     * Validate and persist the posted configuration values.
     *
     * @return string Admin notices (errors + confirmations), already escaped for HTML.
     */
    private function postProcess()
    {
        $output = '';

        if (Tools::isSubmit('submitConvorSettings')) {
            $enabled = (bool) Tools::getValue('CONVOR_ENABLED');
            $slug = (string) Tools::getValue('CONVOR_ORG_SLUG');
            $api_base = (string) Tools::getValue('CONVOR_API_BASE');

            $slug = trim($slug);
            $api_base = trim($api_base);

            if ($slug === '') {
                $output .= $this->displayError($this->l('The organization slug is required.'));
                $slug_valid = false;
            } else {
                $slug_valid = true;
            }

            // Validate apiBase looks like a URL when provided.
            $api_base_valid = true;
            if ($api_base !== '' && !filter_var($api_base, FILTER_VALIDATE_URL)) {
                $output .= $this->displayError($this->l('The API base URL is not a valid URL.'));
                $api_base_valid = false;
            }

            if ($slug_valid && $api_base_valid) {
                $update = Configuration::updateValue('CONVOR_ENABLED', $enabled ? 1 : 0)
                    && Configuration::updateValue('CONVOR_ORG_SLUG', $slug)
                    && Configuration::updateValue('CONVOR_API_BASE', $api_base);

                if ($update) {
                    $output .= $this->displayConfirmation($this->l('Settings updated.'));
                } else {
                    $output .= $this->displayError($this->l('Could not save settings. Please try again.'));
                }
            }
        }

        return $output;
    }

    /**
     * Build the configuration form using HelperForm.
     *
     * @return string Rendered form HTML.
     */
    private function renderForm()
    {
        $fields_form = array(
            'form' => array(
                'legend' => array(
                    'title' => $this->l('Convor Live Chat'),
                    'icon'  => 'icon-envelope',
                ),
                'input' => array(
                    array(
                        'type'    => 'switch',
                        'label'   => $this->l('Enabled'),
                        'name'    => 'CONVOR_ENABLED',
                        'is_bool' => true,
                        'desc'    => $this->l('Turn the widget on or off without removing your settings.'),
                        'values'  => array(
                            array('id' => 'active_on', 'value' => 1, 'label' => $this->l('Yes')),
                            array('id' => 'active_off', 'value' => 0, 'label' => $this->l('No')),
                        ),
                    ),
                    array(
                        'type'     => 'text',
                        'label'    => $this->l('Organization slug'),
                        'name'     => 'CONVOR_ORG_SLUG',
                        'required' => true,
                        'desc'     => $this->l('Your Convor organization public slug, e.g. "acme-inc".'),
                        'hint'     => $this->l('Found in the Convor dashboard under Widget → Embed.'),
                    ),
                    array(
                        'type'     => 'text',
                        'label'    => $this->l('API base URL'),
                        'name'     => 'CONVOR_API_BASE',
                        'desc'     => $this->l('Widget CDN base URL. Leave as default unless you have a custom endpoint.'),
                    ),
                ),
                'submit' => array(
                    'title' => $this->l('Save'),
                ),
            ),
        );

        $helper = new HelperForm();

        $helper->module = $this;
        $helper->name_controller = $this->name;
        $helper->token = Tools::getAdminTokenLite('AdminModules');
        $helper->currentIndex = AdminController::$currentIndex . '&configure=' . $this->name;
        $helper->default_form_language = (int) Configuration::get('PS_LANG_DEFAULT');
        $helper->allow_employee_form_lang = Configuration::get('PS_BO_ALLOW_EMPLOYEE_FORM_LANG') ? Configuration::get('PS_BO_ALLOW_EMPLOYEE_FORM_LANG') : 0;
        $helper->title = $this->displayName;
        $helper->show_toolbar = false;
        $helper->toolbar_scroll = false;
        $helper->tpl_vars = array(
            'fields_value' => $this->getConfigFieldsValues(),
        );

        return $helper->generateForm(array($fields_form));
    }

    /**
     * Current values for the configuration form fields.
     *
     * @return array<string,mixed>
     */
    private function getConfigFieldsValues()
    {
        $api_base = Configuration::get('CONVOR_API_BASE');
        if ($api_base === false || $api_base === '') {
            $api_base = self::DEFAULT_API_BASE;
        }

        $enabled = Configuration::get('CONVOR_ENABLED');
        // Default to enabled so the widget goes live as soon as a slug is saved.
        if ($enabled === false) {
            $enabled = 1;
        }

        return array(
            'CONVOR_ENABLED'  => (int) $enabled,
            'CONVOR_ORG_SLUG' => (string) Configuration::get('CONVOR_ORG_SLUG'),
            'CONVOR_API_BASE' => $api_base,
        );
    }
}
