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
define('MINUTE_IN_SECONDS', 60);

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
		if (isset($_GET['legacy'])) {
			return array(
				'org_slug' => $_GET['legacy'],
				'api_base' => 'https://untrusted-old-cdn.example',
			);
		}
		return array(
			'widget_key' => $_GET['key'] ?? getenv('CONVOR_WIDGET_KEY'),
			'verification_challenge' => $_GET['challenge'] ?? '',
			'enabled' => !isset($_GET['disabled']),
			'consent_required' => isset($_GET['consent']),
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
function wp_json_encode($v, $flags = 0) { return json_encode($v, $flags); }
function add_filter($tag, $callback, $priority = 10, $accepted_args = 1) { add_action($tag, $callback, $priority, $accepted_args); }
function add_settings_error(...$args) {}
function current_user_can($capability) { return true; }
function home_url($path = '') { return 'http://example.test' . $path; }
function wp_unslash($value) { return $value; }
$wp_scripts = array();
function wp_enqueue_script($handle, $src, $deps = array(), $ver = false, $in_footer = false) {
	global $wp_scripts;
	$wp_scripts[$handle] = $src;
}
function wp_get_script_tag($attrs) {
	$parts = array();
	foreach ($attrs as $name => $value) {
		$parts[] = true === $value ? $name : $name . '="' . esc_attr($value) . '"';
	}
	return '<script ' . implode(' ', $parts) . '></script>';
}
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
add_filter('convor_widget_config', function ($config) {
	$config['apiBase'] = getenv('CONVOR_API_BASE') ?: 'http://localhost:5173';
	return $config;
});
if (isset($_GET['allow'])) {
	add_filter('convor_allow_widget', function () { return true; });
}
if (isset($_GET['suppress'])) {
	add_filter('convor_disable_widget', function () { return true; });
}
do_action('plugins_loaded');
if (isset($_GET['sanitize'])) {
	header('Content-Type: application/json');
	echo json_encode((new Convor_Settings())->sanitize_settings(array('widget_key' => $_GET['sanitize'], 'enabled' => '1')));
	exit;
}

// Render the registered scripts through the same public loader-tag filter.
do_action('wp_enqueue_scripts');
$rendered = '';
foreach ($wp_scripts as $handle => $src) {
	$tag = wp_get_script_tag(array('src' => $src));
	foreach (($wp_filters['script_loader_tag'] ?? array()) as $entry) {
		$tag = call_user_func($entry['callback'], $tag, $handle, $src);
	}
	$rendered .= $tag;
}

header('Content-Type: text/html; charset=utf-8');
echo $rendered;
