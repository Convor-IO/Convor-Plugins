<?php
if (!defined('_PS_VERSION_')) {
    exit;
}

/**
 * Read-only, same-origin session context. Never render customer/cart data
 * into a shared storefront cache or accept a customer identifier from JS.
 */
class ConvorContextModuleFrontController extends ModuleFrontController
{
    public function postProcess()
    {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: private, no-store, max-age=0');
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: no-referrer');
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        $base = parse_url($this->context->link->getBaseLink($this->module->shopId()));
        $expected = ($base['scheme'] ?? '') . '://' . ($base['host'] ?? '')
            . (isset($base['port']) ? ':' . $base['port'] : '');
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST'
            || ($_SERVER['HTTP_X_CONVOR_CONTEXT'] ?? '') !== '1'
            || !is_string($origin) || !hash_equals($expected, $origin)) {
            http_response_code(403);
            echo '{}';
            exit;
        }

        $settings = $this->module->settings();
        if (empty($settings['enabled']) || !Convor::validKey($settings['widget_key'])
            || (empty($settings['commerce_context']) && empty($settings['identity_enabled']))) {
            http_response_code(404);
            echo '{}';
            exit;
        }

        $raw = file_get_contents('php://input', false, null, 0, 4096);
        $request = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($request) || ($request['widgetKey'] ?? '') !== $settings['widget_key']) {
            http_response_code(400);
            echo '{}';
            exit;
        }

        $action = $request['action'] ?? 'context';
        if (!in_array($action, array('context', 'session', 'reset'), true)) {
            http_response_code(400);
            echo '{}';
            exit;
        }
        $result = array();
        if (!empty($settings['identity_enabled'])) {
            $secret = $this->module->identitySecret($settings);
            if ($secret === '') {
                http_response_code(503);
                echo '{}';
                exit;
            }
            $customer = $this->context->customer;
            $customerId = $customer && $customer->isLogged() && !$customer->is_guest ? (int) $customer->id : 0;
            $cookie = $this->context->cookie;
            $scope = ConvorVisitorSession::scope($this->module->shopId(), $settings['widget_key'], $secret,
                $customerId, $cookie->session_id ?? 0, $cookie->session_token ?? '');
            $previous = ConvorVisitorSession::read($cookie);
            $handle = ConvorVisitorSession::current($cookie, $this->module->shopId(), $settings['widget_key'], $scope);
            if ($previous && $previous['handle'] !== $handle && $previous['shopId'] === $this->module->shopId()
                && $previous['widgetKey'] === $settings['widget_key']) {
                $this->module->revokeVisitorSession($previous['widgetKey'], $previous['handle']);
            }
            if ($action === 'session') {
                echo json_encode(array('sessionHandle' => $handle, 'changed' => !$previous || $previous['handle'] !== $handle), JSON_THROW_ON_ERROR);
                exit;
            }
            $presented = $request['sessionHandle'] ?? null;
            if (!ConvorVisitorSession::validHandle($presented) || !hash_equals($handle, $presented)) {
                http_response_code(409);
                echo '{}';
                exit;
            }
            if ($action === 'reset') {
                $this->module->revokeVisitorSession($settings['widget_key'], $handle);
                $handle = ConvorVisitorSession::current($cookie, $this->module->shopId(), $settings['widget_key'], $scope, true);
                echo json_encode(array('sessionHandle' => $handle), JSON_THROW_ON_ERROR);
                exit;
            }
            $result['identity'] = ConvorVisitorSession::identity($request['visitorId'] ?? null, $this->module->shopId(), $customerId, $secret);
        } elseif ($action !== 'context' || isset($request['sessionHandle'])) {
            http_response_code(409);
            echo '{}';
            exit;
        }
        if (!empty($settings['commerce_context'])) {
            $result['attributes'] = $this->commerceAttributes($request);
        }
        echo json_encode($result, JSON_THROW_ON_ERROR);
        exit;
    }

    private function commerceAttributes(array $request)
    {
        $currency = (string) ($this->context->currency->iso_code ?? '');
        $attributes = array(
            'productId' => null, 'variationId' => null, 'productName' => null,
            'productPrice' => null, 'productCurrency' => null,
            'cartTotal' => null, 'cartCurrency' => null,
        );
        if (preg_match('/\A[A-Z]{3}\z/', $currency) !== 1) {
            return $attributes;
        }
        $cart = $this->context->cart;
        if ($cart && (int) $cart->id > 0 && (int) $cart->id_shop === $this->module->shopId()) {
            $total = (float) $cart->getOrderTotal(true, Cart::ONLY_PRODUCTS);
            if (is_finite($total)) {
                $attributes['cartTotal'] = number_format($total, (int) $this->context->currency->precision, '.', '');
                $attributes['cartCurrency'] = $currency;
            }
        }

        $productId = filter_var($request['productId'] ?? null, FILTER_VALIDATE_INT, array('options' => array('min_range' => 1)));
        if (!$productId) {
            return $attributes;
        }
        $product = new Product((int) $productId, false, (int) $this->context->language->id, $this->module->shopId());
        if (!Validate::isLoadedObject($product) || !$product->active || !$product->available_for_order
            || !in_array($product->visibility, array('both', 'catalog', 'search'), true)
            || !$product->isAssociatedToShop($this->module->shopId())
            || !$product->checkAccess((int) ($this->context->customer->id ?? 0))) {
            return $attributes;
        }
        $variation = filter_var($request['variationId'] ?? null, FILTER_VALIDATE_INT, array('options' => array('min_range' => 1)));
        if ($variation) {
            $combination = new Combination((int) $variation, null, $this->module->shopId());
            if (!Validate::isLoadedObject($combination) || (int) $combination->id_product !== (int) $productId
                || !$combination->isAssociatedToShop($this->module->shopId())) {
                $variation = null;
            }
        }
        $attributes['productId'] = (string) $productId;
        $attributes['variationId'] = $variation ? (string) $variation : null;
        $attributes['productName'] = Tools::substr(strip_tags((string) $product->name), 0, 255);
        // Context is informational, not an authoritative AI price quote.
        $price = (float) Product::getPriceStatic((int) $productId, true, $variation ?: null);
        if (is_finite($price)) {
            $attributes['productPrice'] = number_format($price, (int) $this->context->currency->precision, '.', '');
            $attributes['productCurrency'] = $currency;
        }
        return $attributes;
    }
}
