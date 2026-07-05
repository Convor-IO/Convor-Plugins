<?php
/**
 * OpenCart harness: exercise Catalog\Controller\Module\Convor::injectScript
 * without booting OpenCart.
 *
 * Serves on `php -S 127.0.0.1:<port> _opencart-harness.php`.
 *
 * OpenCart 4's catalog controller lives under a namespace
 * (Opencart\Catalog\Controller\Module) and extends OpenCart's Engine\Controller,
 * so it can't be `require`d standalone. Instead we:
 *   1. Read the controller source.
 *   2. Extract just the body of injectScript() (it references only $this->config,
 *      rawurlencode, htmlspecialchars, stripos, substr_replace, rtrim — no
 *      namespace symbols).
 *   3. Evaluate that body inside a stub controller whose $this->config returns
 *      our test values, with $route/$data/$output in scope.
 *   4. Echo the resulting $output (the header HTML with the tag inserted).
 *
 * ?seed=<raw> lets the test feed a pre-rendered header (to exercise the
 * </head>-insertion branch); default is empty (append branch).
 */

declare(strict_types=1);

$controllerPath = dirname(__DIR__) . '/opencart/catalog/controller/module/convor.php';
$src = file_get_contents($controllerPath);

// Locate injectScript()'s body via a brace-depth scan from its signature.
if (!preg_match(
	'/public function injectScript\([^)]*\)\s*:\s*void\s*\{/',
	$src,
	$m,
	PREG_OFFSET_CAPTURE,
)) {
	http_response_code(500);
	echo "could not locate injectScript() in $controllerPath";
	return;
}

$start = $m[0][1] + strlen($m[0][0]);
$depth = 1;
$i = $start;
$len = strlen($src);
while ($i < $len && $depth > 0) {
	$c = $src[$i];
	if ($c === '{') {
		$depth++;
	} elseif ($c === '}') {
		$depth--;
		if ($depth === 0) {
			break;
		}
	}
	$i++;
}
if ($depth !== 0) {
	http_response_code(500);
	echo "unbalanced braces in injectScript()";
	return;
}
$body = substr($src, $start, $i - $start);

// Stub $this->config — return canned settings for the three keys injectScript
// reads, null otherwise (mirroring OpenCart's Config::get).
$configMap = array(
	'module_convor_widget_status'   => '1',
	'module_convor_widget_org_slug' => getenv('CONVOR_ORG_SLUG') ?: 'acme',
	'module_convor_widget_api_base' => getenv('CONVOR_API_BASE') ?: 'http://localhost:5173',
);

$controller = new class ($configMap) {
	public $config;
	public function __construct(array $map) {
		$this->config = new class ($map) {
			private $map;
			public function __construct(array $map) { $this->map = $map; }
			public function get($key) {
				return array_key_exists($key, $this->map) ? $this->map[$key] : null;
			}
		};
	}
};

$route = 'common/header';
$data = array();
// Seed output lets the test exercise the </head>-insertion branch.
$seed = isset($_GET['seed']) ? $_GET['seed'] : '';
$output = is_string($seed) ? $seed : '';

// Evaluate the method body with $this/$route/$data/$output bound. The body
// assigns to $output by reference (its declared param), so bind it ref-ly.
$closure = Closure::bind(
	function () use (&$route, &$data, &$output, $body) {
		eval($body);
	},
	$controller,
	$controller::class,
);
$closure();

header('Content-Type: text/html; charset=utf-8');
echo $output;
