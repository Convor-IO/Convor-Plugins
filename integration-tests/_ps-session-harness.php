<?php
declare(strict_types=1);
define('_PS_VERSION_', '9.2.1');
define('_COOKIE_KEY_', 'synthetic-fixture-cookie-encryption-key');
require_once __DIR__ . '/../prestashop/classes/ConvorVisitorSession.php';

class TestCookie {
    public $convor_visitor_session;
    public function write() {}
}
function check($condition, $message) {
    if (!$condition) {
        fwrite(STDERR, $message . PHP_EOL);
        exit(1);
    }
}
$secret = 'convor_identity_' . str_repeat('x', 43);
$key = 'convor_wpk_' . str_repeat('a', 64);
$other = 'convor_wpk_' . str_repeat('b', 64);
$encrypted = ConvorVisitorSession::encrypt($secret, 1, $key);
check($encrypted !== '' && strpos($encrypted, $secret) === false, 'plaintext secret');
check(ConvorVisitorSession::decrypt($encrypted, 1, $key) === $secret, 'decrypt valid');
check(ConvorVisitorSession::decrypt($encrypted, 2, $key) === '', 'cross-shop decrypt');
check(ConvorVisitorSession::decrypt($encrypted, 1, $other) === '', 'cross-site decrypt');
check(ConvorVisitorSession::decrypt('garbage', 1, $key) === '', 'bad ciphertext');
$bytes = base64_decode($encrypted, true);
$bytes[30] = chr(ord($bytes[30]) ^ 1);
check(ConvorVisitorSession::decrypt(base64_encode($bytes), 1, $key) === '', 'tampered ciphertext');
$cookie = new TestCookie();
$guest = ConvorVisitorSession::scope(1, $key, $secret, 0, 0, '');
$a = ConvorVisitorSession::scope(1, $key, $secret, 42, 1, 'login-a');
$b = ConvorVisitorSession::scope(1, $key, $secret, 43, 2, 'login-b');
$handle = ConvorVisitorSession::current($cookie, 1, $key, $guest);
check(ConvorVisitorSession::validHandle($handle), 'UUID');
check(ConvorVisitorSession::current($cookie, 1, $key, $guest) === $handle, 'guest reload');
$accountA = ConvorVisitorSession::current($cookie, 1, $key, $a);
check($accountA !== $handle, 'guest -> customer');
check(ConvorVisitorSession::current($cookie, 1, $key, $a) === $accountA, 'same login');
$accountB = ConvorVisitorSession::current($cookie, 1, $key, $b);
check($accountB !== $accountA, 'account A -> account B');
check(ConvorVisitorSession::current($cookie, 1, $key, $guest) !== $handle, 'logout does not reuse guest history');
$relogin = ConvorVisitorSession::scope(1, $key, $secret, 42, 3, 'new-login');
check($relogin !== $a, 'same customer new authentication session');
check(ConvorVisitorSession::scope(1, $key, 'rotated', 42, 1, 'login-a') !== $a, 'secret rotation changes session scope');
$old = ConvorVisitorSession::current($cookie, 1, $key, $relogin);
check(ConvorVisitorSession::current($cookie, 1, $key, $relogin, true) !== $old, 'reset rotates');
ConvorVisitorSession::clear($cookie);
check(ConvorVisitorSession::read($cookie) === null, 'logout clears cookie');

$visitorId = '11111111-1111-4111-8111-111111111111';
$identity = ConvorVisitorSession::identity($visitorId, 1, 42, $secret);
check(is_array($identity) && count($identity) === 2, 'minimal pseudonymous payload');
check(ConvorVisitorSession::identity($visitorId, 1, 0, $secret) === null, 'guest is anonymous');
check(ConvorVisitorSession::identity('invalid', 1, 42, $secret) === null, 'invalid visitor');
check(ConvorVisitorSession::identity($visitorId, 2, 42, $secret)['id'] !== $identity['id'], 'shop-scoped identity');
check(ConvorVisitorSession::identity($visitorId, 1, 43, $secret)['id'] !== $identity['id'], 'customer-scoped identity');
check(ConvorVisitorSession::identity($visitorId, 1, 42, $secret)['id'] === $identity['id'], 'same visitor remains stable');
check(ConvorVisitorSession::identity('22222222-2222-4222-8222-222222222222', 1, 42, $secret)['id'] !== $identity['id'], 'new visitor for returning customer must not collide with the prior visitor record');
echo json_encode(array('identity' => $identity, 'visitorId' => $visitorId, 'secret' => $secret), JSON_THROW_ON_ERROR);
