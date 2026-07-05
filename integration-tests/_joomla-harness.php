<?php
/**
 * Joomla harness: load the PlgSystemConvor plugin in isolation, build a
 * minimal plugin instance with a stub params/app/document, invoke
 * onBeforeCompileHead(), and reconstruct the canonical <script> tag from the
 * WebAssetManager calls (or the addCustomTag fallback). Returns the HTML.
 *
 * Serves on `php -S 127.0.0.1:<port> _joomla-harness.php`.
 */

declare(strict_types=1);

// --- Joomla shims in their real namespaces -------------------------------

namespace Joomla\CMS\WebAsset {
	/**
	 * Stub WebAssetManager: captures registerScript()/useScript() calls so the
	 * harness can reconstruct the <script> tag Joomla would emit.
	 */
	class WebAssetManager {
		public $registered = array();
		public $used = array();
		public function registerScript($name, $uri = null, array $deps = array(), array $attributes = array()) {
			$this->registered[$name] = array('uri' => $uri, 'deps' => $deps, 'attributes' => $attributes);
		}
		public function useScript($name) {
			$this->used[] = $name;
		}
	}
}

namespace Joomla\CMS\Application {
	use Joomla\CMS\WebAsset\WebAssetManager;
	/**
	 * Minimal CMSApplicationInterface stand-in.
	 */
	class CmsApp {
		/** @var object */
		public $document;
		public function isClient($client) { return $client === 'site'; }
		public function getDocument() { return $this->document; }
		public function getName() { return 'site'; }
	}
	// The plugin references the interface via instanceof; define it too.
	interface CMSApplicationInterface {
		public function isClient($client);
		public function getDocument();
	}
	class CMSApplication extends CmsApp implements CMSApplicationInterface {}
}

namespace Joomla\CMS {
	use Joomla\CMS\Application\CMSApplication;
	class Factory {
		public static function getApplication() {
			return $GLOBALS['__joomla_app'];
		}
	}
}

namespace Joomla\CMS\Plugin {
	use Joomla\CMS\Application\CMSApplicationInterface;
	use Joomla\Registry\Registry;
	/**
	 * Minimal CMSPlugin base. Stores params and an application reference and
	 * exposes getApplication() like the real J4/J5 base plugin.
	 */
	abstract class CMSPlugin {
		/** @var Registry */
		public $params;
		/** @var CMSApplicationInterface|null */
		protected $app = null;
		public function __construct(&$subject, $config = array()) {
			if (isset($config['params'])) {
				$this->params = $config['params'];
			} else {
				$this->params = new \Joomla\Registry\Registry();
			}
			if (isset($config['app'])) {
				$this->app = $config['app'];
			}
		}
		public function setApplication(CMSApplicationInterface $app) { $this->app = $app; }
		public function getApplication() {
			if ($this->app !== null) { return $this->app; }
			return \Joomla\CMS\Factory::getApplication();
		}
	}
}

namespace Joomla\Registry {
	class Registry {
		private $data = array();
		public function __construct($data = array()) {
			if (is_array($data)) { $this->data = $data; }
		}
		public function get($path, $default = null) {
			return array_key_exists($path, $this->data) ? $this->data[$path] : $default;
		}
		public function set($path, $value) { $this->data[$path] = $value; }
	}
}

// --- Global namespace: build plugin instance + invoke hook ----------------
namespace {

	use Joomla\CMS\Application\CMSApplication;
	use Joomla\CMS\WebAssetManager;
	use Joomla\Registry\Registry;

	define('_JEXEC', 1);

	// Build the document with a WebAssetManager that captures calls, plus an
	// addCustomTag() fallback that captures the raw string.
	$GLOBALS['__joomla_doc'] = new class {
		public $wam;
		public $customTags = array();
		public function __construct() {
			$this->wam = new \Joomla\CMS\WebAsset\WebAssetManager();
		}
		public function getWebAssetManager() { return $this->wam; }
		public function getType() { return 'html'; }
		public function addCustomTag($html) { $this->customTags[] = $html; }
	};

	$app = new CMSApplication();
	$app->document = $GLOBALS['__joomla_doc'];
	$GLOBALS['__joomla_app'] = $app;

	// --- Load the plugin --------------------------------------------------
	require_once dirname(__DIR__) . '/joomla/convor.php';

	// --- Construct the plugin instance -----------------------------------
	$params = new Registry(array(
		'enabled'  => (int) (getenv('CONVOR_ENABLED') ?: 1),
		'org_slug' => getenv('CONVOR_ORG_SLUG') ?: 'acme',
		'api_base' => getenv('CONVOR_API_BASE') ?: 'http://localhost:5173',
	));

	$subject = null;
	$plugin = new \PlgSystemConvor($subject, array(
		'params' => $params,
		'app'    => $app,
	));

	// --- Invoke the hook --------------------------------------------------
	$plugin->onBeforeCompileHead();

	// --- Reconstruct the rendered <script> tag ----------------------------
	$rendered = '';

	// Primary path: WebAssetManager registered + used assets.
	foreach ($GLOBALS['__joomla_doc']->wam->used as $name) {
		if (!isset($GLOBALS['__joomla_doc']->wam->registered[$name])) {
			continue;
		}
		$reg = $GLOBALS['__joomla_doc']->wam->registered[$name];
		$uri = $reg['uri'];
		$attrs = $reg['attributes'];

		// Reconstruct the tag exactly as Joomla's HtmlDocument would render a
		// registered script asset with extra attributes.
		$attrStr = ' src="' . htmlspecialchars($uri, ENT_QUOTES, 'UTF-8') . '"';
		foreach ($attrs as $k => $v) {
			if ($v === true || $v === 'true') {
				$attrStr .= ' ' . $k;
			} elseif ($v === false || $v === null) {
				continue;
			} else {
				$attrStr .= ' ' . $k . '="' . htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8') . '"';
			}
		}
		$rendered .= '<script' . $attrStr . '></script>' . "\n";
	}

	// Fallback path: addCustomTag strings.
	foreach ($GLOBALS['__joomla_doc']->customTags as $tag) {
		$rendered .= $tag . "\n";
	}

	header('Content-Type: text/html; charset=utf-8');
	echo $rendered;
}
