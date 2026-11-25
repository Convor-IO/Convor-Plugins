<?php
if (!defined('_PS_VERSION_')) {
    exit;
}

/** Per-shop, cookie-bound visitor session. The handle is a credential. */
final class ConvorVisitorSession
{
    const COOKIE = 'convor_visitor_session';

    public static function validSecret($value)
    {
        return is_string($value) && preg_match('/\Aconvor_identity_[A-Za-z0-9_-]{43}\z/', $value) === 1;
    }

    private static function encryptionKey($shopId, $widgetKey)
    {
        return hash_hmac('sha256', 'convor:identity:' . (int) $shopId . ':' . $widgetKey, _COOKIE_KEY_, true);
    }

    public static function encrypt($secret, $shopId, $widgetKey)
    {
        if (!self::validSecret($secret)) {
            return '';
        }
        $iv = random_bytes(12);
        $tag = '';
        $cipher = openssl_encrypt($secret, 'aes-256-gcm', self::encryptionKey($shopId, $widgetKey), OPENSSL_RAW_DATA, $iv, $tag);
        return is_string($cipher) && strlen($tag) === 16 ? base64_encode($iv . $tag . $cipher) : '';
    }

    public static function decrypt($encrypted, $shopId, $widgetKey)
    {
        $data = is_string($encrypted) ? base64_decode($encrypted, true) : false;
        if (!is_string($data) || strlen($data) < 29) {
            return '';
        }
        $secret = openssl_decrypt(substr($data, 28), 'aes-256-gcm', self::encryptionKey($shopId, $widgetKey), OPENSSL_RAW_DATA, substr($data, 0, 12), substr($data, 12, 16));
        return self::validSecret($secret) ? $secret : '';
    }

    public static function validHandle($value)
    {
        return is_string($value) && preg_match('/\A[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/', $value) === 1;
    }

    private static function uuid()
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        $hex = bin2hex($bytes);
        return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4)
            . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20, 12);
    }

    /** The caller has already checked Customer::isLogged() against the actual session. */
    public static function scope($shopId, $widgetKey, $secret, $customerId, $sessionId, $sessionToken)
    {
        $subject = $customerId > 0 ? array('customer', (int) $customerId, (int) $sessionId, (string) $sessionToken) : array('guest');
        return hash_hmac('sha256', json_encode(array((int) $shopId, $widgetKey, hash('sha256', $secret), $subject), JSON_THROW_ON_ERROR), _COOKIE_KEY_);
    }

    public static function read($cookie)
    {
        $raw = $cookie->{self::COOKIE} ?? '';
        $decoded = is_string($raw) ? base64_decode($raw, true) : false;
        $state = is_string($decoded) ? json_decode($decoded, true) : null;
        if (!is_array($state) || !self::validHandle($state['handle'] ?? null)
            || !is_string($state['scope'] ?? null) || !is_string($state['widgetKey'] ?? null)
            || !is_int($state['shopId'] ?? null)) {
            return null;
        }
        return $state;
    }

    public static function current($cookie, $shopId, $widgetKey, $scope, $rotate = false)
    {
        $state = self::read($cookie);
        if (!$rotate && $state && $state['shopId'] === (int) $shopId
            && hash_equals($state['widgetKey'], $widgetKey) && hash_equals($state['scope'], $scope)) {
            return $state['handle'];
        }
        $state = array('handle' => self::uuid(), 'scope' => $scope, 'widgetKey' => $widgetKey, 'shopId' => (int) $shopId);
        $cookie->{self::COOKIE} = base64_encode(json_encode($state, JSON_THROW_ON_ERROR));
        $cookie->write();
        return $state['handle'];
    }

    public static function clear($cookie)
    {
        unset($cookie->{self::COOKIE});
        $cookie->write();
    }

    /** Match the canonical Convor HMAC payload; sign only the current authenticated customer. */
    public static function identity($visitorId, $shopId, $customerId, $secret)
    {
        if ((int) $customerId <= 0 || !self::validSecret($secret)
            || !is_string($visitorId)
            || preg_match('/\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i', $visitorId) !== 1) {
            return null;
        }
        // Convor's external ID is unique per visitor record within a site.
        // Bind the pseudonym to the current visitor as well as the shop/customer:
        // a new login or signing-key rotation must not collide with or recover
        // a prior, revoked visitor. No customer PII is sent.
        $id = 'ps_' . hash_hmac('sha256', 'convor:customer:' . (int) $shopId . ':' . (int) $customerId . ':' . strtolower($visitorId), _COOKIE_KEY_);
        $payload = json_encode(array('visitorId' => $visitorId, 'id' => $id, 'email' => '', 'name' => '', 'phone' => ''), JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        return array('id' => $id, 'userHash' => hash_hmac('sha256', $payload, $secret));
    }
}
