<?php
/**
 * Magento harness: render the real widget_script.phtml template with stubbed
 * $block + $escaper, and emit the result. Also exposes a CSP check endpoint.
 *
 * Serves on `php -S 127.0.0.1:<port> _magento-harness.php`.
 *
 * Magento's Block/WidgetScript reads system config and exposes
 * getScriptUrl()/getOrgSlug() to the .phtml. We can't boot Magento, so we
 * stand up just those two getters (fed from env vars) plus a passthrough
 * $escaper (our test values are safe) and require the real template file.
 */

declare(strict_types=1);

$SLUG = getenv('CONVOR_ORG_SLUG') ?: 'acme';
$API_BASE = rtrim(getenv('CONVOR_API_BASE') ?: 'http://localhost:5173', '/');

// Minimal $escaper stand-in. Real Magento's escapeUrl/escapeHtmlAttr harden
// untrusted input; our test values (acme, http://localhost:5173) are safe and
// unchanged by either, so a passthrough is faithful here.
$escaper = new class {
	public function escapeUrl($value) {
		return (string) $value;
	}
	public function escapeHtmlAttr($value) {
		return (string) $value;
	}
};

// Minimal $block stand-in exposing the two getters the template calls.
// Mirrors Block/WidgetScript::getScriptUrl() / getOrgSlug().
$block = new class ($SLUG, $API_BASE) {
	private $slug;
	private $apiBase;
	public function __construct($slug, $apiBase) {
		$this->slug = $slug;
		$this->apiBase = $apiBase;
	}
	public function getScriptUrl() {
		return $this->apiBase . '/widget.js';
	}
	public function getOrgSlug() {
		return $this->slug;
	}
};

// Route: / renders the .phtml; /csp returns the parsed whitelist as JSON.
$path = isset($_SERVER['REQUEST_URI']) ? parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) : '/';

if ($path === '/csp') {
	// Parse csp_whitelist.xml without SimpleXML/DOM (this PHP build ships
	// neither). The file is small and regular, so a regex walk over
	// <policy id="..."><values><value type="host">…</value></values></policy>
	// is reliable here.
	$xml = file_get_contents(dirname(__DIR__) . '/magento/etc/csp_whitelist.xml');
	$policies = array();
	if (
		preg_match_all(
			'/<policy\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/policy>/',
			$xml,
			$pm,
			PREG_SET_ORDER,
		)
	) {
		foreach ($pm as $p) {
			$id = $p[1];
			$body = $p[2];
			$hosts = array();
			if (
				preg_match_all(
					'/<value[^>]*type="host"[^>]*>([^<]+)<\/value>/',
					$body,
					$vm,
					PREG_SET_ORDER,
				)
			) {
				foreach ($vm as $v) {
					$hosts[] = trim($v[1]);
				}
			}
			$policies[$id] = $hosts;
		}
	}
	header('Content-Type: application/json');
	echo json_encode($policies);
	return;
}

// Default: render the template (output buffering captures the literal HTML,
// exactly what ships to the storefront <head>).
$template = dirname(__DIR__) . '/magento/view/frontend/templates/widget_script.phtml';
ob_start();
require $template;
$rendered = (string) ob_get_clean();

header('Content-Type: text/html; charset=utf-8');
echo $rendered;
