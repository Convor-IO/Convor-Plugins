<?php
/**
 * Drupal harness: load the convor_widget.module in isolation, call
 * convor_widget_page_attachments(), and render the attached html_head render
 * arrays to HTML. Returns the rendered HTML.
 *
 * Serves on `php -S 127.0.0.1:<port> _drupal-harness.php`.
 */

declare(strict_types=1);

// --- Drupal shims in their proper namespaces ------------------------------

namespace Drupal\Core\Render {
	/**
	 * No-op BubbleableMetadata: the harness doesn't care about cache metadata.
	 */
	class BubbleableMetadata {
		public static function createFromObject($obj) {
			return new self();
		}
		public function applyTo(array &$elements) {
			// Intentionally empty: nothing to merge in the harness.
		}
	}
}

namespace Drupal\Core {
	class Url {
		public static function fromRoute($r) { return new self(); }
		public function toString() { return ''; }
	}
}

// Global namespace: \Drupal facade + t() + the html_tag renderer.
namespace {

	/**
	 * Immutable config replacement supporting get($key).
	 */
	class ConvorImmutableConfig {
		private $data;
		public function __construct(array $data) { $this->data = $data; }
		public function get($key) {
			return array_key_exists($key, $this->data) ? $this->data[$key] : null;
		}
	}

	/**
	 * Minimal \Drupal facade (global namespace). Only config() is exercised
	 * by convor_widget_page_attachments().
	 */
	class Drupal {
		public static function config($name) {
			if ($name === 'convor_widget.settings') {
				return new ConvorImmutableConfig(array(
					'enabled'  => (bool) (getenv('CONVOR_ENABLED') ?: true),
					'org_slug' => getenv('CONVOR_ORG_SLUG') ?: 'acme',
					'api_base' => getenv('CONVOR_API_BASE') ?: 'http://localhost:5173',
				));
			}
			return new ConvorImmutableConfig(array());
		}
	}

	function t($string, array $args = array(), array $options = array()) {
		return $string;
	}

	/**
	 * Render a Drupal html_tag render array to its HTML string.
	 * Handles: #tag, #attributes (boolean true => bareword), #value.
	 */
	function convor_render_html_tag(array $element) {
		$tag = $element['#tag'] ?? 'div';
		$attributes = $element['#attributes'] ?? array();

		$attr_str = '';
		foreach ($attributes as $name => $value) {
			if ($value === true) {
				$attr_str .= ' ' . $name;
			} elseif (is_array($value)) {
				$attr_str .= ' ' . $name . '="' . htmlspecialchars(implode(' ', $value), ENT_QUOTES, 'UTF-8') . '"';
			} else {
				$attr_str .= ' ' . $name . '="' . htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8') . '"';
			}
		}

		// <script> is a raw-text element; Drupal emits no inner content here.
		if ($tag === 'script' || $tag === 'style') {
			return '<' . $tag . $attr_str . '></' . $tag . '>';
		}
		return '<' . $tag . $attr_str . ' />';
	}

	// --- Load the module --------------------------------------------------
	require_once dirname(__DIR__) . '/drupal/convor_widget.module';

	// --- Invoke convor_widget_page_attachments ----------------------------
	$attachments = array();
	convor_widget_page_attachments($attachments);

	$rendered = '';
	if (isset($attachments['#attached']['html_head'])) {
		foreach ($attachments['#attached']['html_head'] as $entry) {
			$element = $entry[0];
			$rendered .= convor_render_html_tag($element) . "\n";
		}
	}

	header('Content-Type: text/html; charset=utf-8');
	echo $rendered;
}
