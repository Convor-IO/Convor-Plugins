<?php
/**
 * PrestaShop harness: load the Convor module in isolation, call
 * hookDisplayHeader(), and render the Smarty header.tpl with the assigned
 * vars. Returns the rendered HTML.
 *
 * Serves on `php -S 127.0.0.1:<port> _ps-harness.php`.
 */

declare(strict_types=1);

define('_PS_VERSION_', '8.0.0');

// --- PrestaShop shims -----------------------------------------------------

/**
 * Minimal Smarty-like renderer: captures assign() vars and render()s a .tpl
 * file by interpreting the small subset of Smarty syntax the Convor header
 * template uses: {$var|modifier:args} and {if isset($x) && $x} ... {/if}.
 */
class FakeSmarty {
	public $assigned = array();
	public $tpl_dir = '';

	public function assign($vars) {
		foreach ($vars as $k => $v) {
			$this->assigned[$k] = $v;
		}
	}

	/**
	 * Render a Smarty template using only the constructs the Convor template
	 * relies on. This is NOT a general Smarty implementation.
	 */
	public function fetch($template) {
		$file = rtrim($this->tpl_dir, '/') . '/' . ltrim($template, '/');
		$src = file_get_contents($file);

		// Evaluate {if isset($x) && $x} ... {/if}.
		$src = preg_replace_callback(
			'/{if\s+isset\((\$\w+)\)\s*&&\s*\$\w+\}(.*?)\{\/if\}/s',
			function ($m) {
				$var = substr($m[1], 1); // strip $
				if (!empty($this->assigned[$var])) {
					return $m[2];
				}
				return '';
			},
			$src,
		);

		// Strip Smarty comments {* ... *}.
		$src = preg_replace('/\{\*.*?\*\}/s', '', $src);

		// Replace {$var|modifier:...} and {$var}.
		$that = $this;
		$src = preg_replace_callback(
			'/\{(\$\w+)((?:\|\w+(?::[^}]*)?)*)\}/',
			function ($m) use ($that) {
				$var = substr($m[1], 1);
				$val = isset($that->assigned[$var]) ? $that->assigned[$var] : '';
				$modifiers = $m[2];
				// Apply modifiers. For the Convor template these are escape
				// modifiers; emulate html/htmlall escaping via htmlspecialchars.
				if ($modifiers !== '') {
					$val = htmlspecialchars((string) $val, ENT_QUOTES, 'UTF-8');
				}
				return $val;
			},
			$src,
		);

		return $src;
	}
}

/**
 * Minimal Context with a smarty instance and a Module-aware display().
 */
class FakeContext {
	public $smarty;

	public function __construct() {
		$this->smarty = new FakeSmarty();
	}
}

class Context {
	public static function getContext() {
		static $ctx = null;
		if ($ctx === null) {
			$ctx = new FakeContext();
		}
		return $ctx;
	}
}

class Configuration {
	public static function get($key, $id_lang = null) {
		switch ($key) {
			case 'CONVOR_ENABLED':
				return '1';
			case 'CONVOR_ORG_SLUG':
				return getenv('CONVOR_ORG_SLUG') ?: 'acme';
			case 'CONVOR_API_BASE':
				return getenv('CONVOR_API_BASE') ?: 'http://localhost:5173';
		}
		return false;
	}

	public static function updateValue($k, $v) { return true; }
	public static function deleteByName($k) { return true; }
}

class Tools {
	public static function isSubmit($k) { return false; }
	public static function getValue($k, $d = null) { return $d; }
	public static function getAdminTokenLite($k) { return 'token'; }
}

class HelperForm {
	public function generateForm($f) { return ''; }
}

class AdminController {
	public static $currentIndex = 'index.php';
}

class Module {
	public $name;
	public $tab;
	public $version;
	public $author;
	public $need_instance;
	public $bootstrap;
	public $ps_versions_compliancy;
	public $displayName;
	public $description;
	public $confirmUninstall;

	/** @var FakeContext */
	public $context;

	public function __construct() {
		$this->context = Context::getContext();
	}

	public function install() { return true; }
	public function uninstall() { return true; }
	public function registerHook($h) { return true; }

	/**
	 * Emulate Module::display(): render the given template relative to the
	 * module directory using the (fake) smarty.
	 */
	public function display($file, $template) {
		// Module directory = dirname($file).
		$this->context->smarty->tpl_dir = dirname($file);
		return $this->context->smarty->fetch($template);
	}

	public function l($s) { return $s; }
	public function displayError($s) { return ''; }
	public function displayConfirmation($s) { return ''; }
}

// --- Load the module ------------------------------------------------------
require_once dirname(__DIR__) . '/prestashop/convor.php';

// --- Invoke hookDisplayHeader --------------------------------------------
$module = new Convor();
$rendered = $module->hookDisplayHeader(array());

header('Content-Type: text/html; charset=utf-8');
echo $rendered;
