<?php
if (!defined('_PS_VERSION_')) {
    exit;
}

/**
 * Public browser relay. It cannot read the administrator cookie, redeem
 * grants or mutate configuration; the original BO tab performs that POST.
 */
class ConvorPairingModuleFrontController extends ModuleFrontController
{
    public function postProcess()
    {
        $state = Tools::getValue('state');
        $code = Tools::getValue('code');
        header('Cache-Control: no-store, private');
        header('Referrer-Policy: no-referrer');
        header('X-Content-Type-Options: nosniff');
        header("Content-Security-Policy: default-src 'none'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'");
        if (!is_string($state) || preg_match('/\A[a-f0-9]{64}\z/', $state) !== 1
            || !is_string($code) || preg_match('/\A[A-Za-z0-9_-]{32}\z/', $code) !== 1) {
            http_response_code(400);
            exit;
        }
        $this->context->smarty->assign(array(
            'convor_pair_state' => $state,
            'convor_pair_code' => $code,
            'convor_pair_script' => __PS_BASE_URI__ . 'modules/convor/views/js/pairing-return.js',
            'convor_language' => $this->context->language->iso_code,
        ));
        echo $this->module->display(_PS_MODULE_DIR_ . 'convor/convor.php', 'views/templates/front/pairing.tpl');
        exit;
    }
}
