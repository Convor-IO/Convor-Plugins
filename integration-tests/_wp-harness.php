<?php
/**
 * WordPress harness: load the Convor plugin in isolation and invoke the
 * wp_footer callback, capturing its echoed output.
 *
 * Serves on `php -S 127.0.0.1:<port> _wp-harness.php`.
 */

declare(strict_types=1);

// --- WordPress shims ------------------------------------------------------

define('ABSPATH', true);

$wp_actions = array();
$wp_filters = array();

function add_action($tag, $callback, $priority = 10, $accepted_args = 1) {
	global $wp_filters;
	$wp_filters[$tag][] = array('callback' => $callback, 'priority' => (int) $priority);
}

/**
 * Fire an action: invoke every callback registered for $tag.
 * Mimics WP's do_action() just enough for the harness.
 */
function do_action($tag, ...$args) {
	global $wp_filters;
	if (!isset($wp_filters[$tag])) {
		return;
	}
	foreach ($wp_filters[$tag] as $entry) {
		call_user_func($entry['callback'], ...$args);
	}
}

function apply_filters($tag, $value) {
	global $wp_filters;
	if (!isset($wp_filters[$tag])) {
		return $value;
	}
	foreach ($wp_filters[$tag] as $entry) {
		$value = call_user_func($entry['callback'], $value);
	}
	return $value;
}

/**
 * get_option: return the configured Convor settings.
 */
function get_option($name, $default = false) {
	if ($name === 'convor_settings') {
		return array(
			'org_slug' => getenv('CONVOR_ORG_SLUG') ?: 'acme',
			'api_base' => getenv('CONVOR_API_BASE') ?: 'http://localhost:5173',
		);
	}
	return $default;
}

function esc_url($url) { return $url; }
function esc_attr($v) { return htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8'); }
function esc_html($v) { return htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8'); }
function esc_html__($t) { return $t; }
function esc_html_e($t) { echo esc_html($t); }
function __($t) { return $t; }
function _e($t) { echo $t; }
function esc_url_raw($u) { return $u; }

function plugin_dir_path($file) {
	return dirname(__DIR__) . '/wordpress/';
}
function plugin_dir_url($file) {
	return 'http://example.test/wordpress/';
}
function plugin_basename($file) { return 'convor/convor.php'; }
function trailingslashit($s) { return rtrim((string) $s, '/') . '/'; }
function load_plugin_textdomain() {}
function is_admin() { return false; }
function wp_doing_ajax() { return false; }
function is_feed() { return false; }
function is_preview() { return false; }
function is_robots() { return false; }
function is_trackback() { return false; }
function wp_is_json_request() { return false; }
function wp_json_encode($v) { return json_encode($v); }
function add_option() {}
function register_activation_hook() {}
function wc_get_product() { return null; }
function is_product() { return false; }
function get_woocommerce_currency() { return ''; }
function wc_format_decimal($v) { return (string) $v; }
function WC() { return null; }

// --- Load the plugin ------------------------------------------------------
// convor.php defines ABSPATH guard then loads includes/ via CONVOR_PLUGIN_DIR.
require_once dirname(__DIR__) . '/wordpress/convor.php';

// Fire the `plugins_loaded` action so the plugin bootstraps (instantiates
// Convor_Embed, which in turn registers the `wp_footer` callback).
do_action('plugins_loaded');

// --- Invoke the wp_footer callback (Convor_Embed::render) ----------------
$rendered = '';
foreach (($GLOBALS['wp_filters']['wp_footer'] ?? array()) as $entry) {
	if (!is_array($entry) || !isset($entry['callback'])) {
		continue;
	}
	$cb = $entry['callback'];
	// Only run our embed (skip the WooCommerce context which is harmless anyway).
	ob_start();
	if (is_array($cb)) {
		call_user_func($cb);
	} else {
		call_user_func($cb);
	}
	$rendered .= ob_get_clean();
}

header('Content-Type: text/html; charset=utf-8');
echo $rendered;
