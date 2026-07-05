<?php
/**
 * Plugin Name:       Convor Live Chat
 * Plugin URI:        https://convor.io
 * Description:       Add the Convor live-chat widget to your WordPress site. Install, enter your org slug, and you're live.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      8.0
 * Author:            Convor
 * Author URI:        https://convor.io
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       convor
 * Domain Path:       /languages
 *
 * @package Convor
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'CONVOR_VERSION', '1.0.0' );
define( 'CONVOR_PLUGIN_FILE', __FILE__ );
define( 'CONVOR_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'CONVOR_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

require_once CONVOR_PLUGIN_DIR . 'includes/class-convor-settings.php';
require_once CONVOR_PLUGIN_DIR . 'includes/class-convor-embed.php';
require_once CONVOR_PLUGIN_DIR . 'includes/class-convor-woocommerce.php';

/**
 * Register the default widget configuration.
 *
 * Other plugins/themes can override any of these values via the
 * `convor_widget_config` filter, which is applied in Convor_Embed::render().
 *
 * @since 1.0.0
 *
 * @return array<string,mixed> {
 *     Widget embed configuration.
 *
 *     @type string $key     Organization public slug (required to emit the tag).
 *     @type string $apiBase Widget CDN base URL.
 * }
 */
function convor_default_config(): array {
	$options = get_option( 'convor_settings', array() );

	return array(
		'key'     => isset( $options['org_slug'] ) ? (string) $options['org_slug'] : '',
		'apiBase' => isset( $options['api_base'] ) && '' !== $options['api_base']
			? (string) $options['api_base']
			: 'https://cdn.convor.io',
	);
}

add_action( 'plugins_loaded', 'convor_init' );
/**
 * Boot the plugin components.
 *
 * @since 1.0.0
 */
function convor_init(): void {
	new Convor_Settings();
	new Convor_Embed();

	if ( class_exists( 'WooCommerce' ) ) {
		new Convor_WooCommerce();
	}

	load_plugin_textdomain( 'convor', false, dirname( plugin_basename( CONVOR_PLUGIN_FILE ) ) . '/languages' );
}

register_activation_hook( __FILE__, 'convor_activate' );
/**
 * Set default options on activation (no data cleanup happens here).
 *
 * @since 1.0.0
 */
function convor_activate(): void {
	if ( false === get_option( 'convor_settings', false ) ) {
		add_option(
			'convor_settings',
			array(
				'org_slug' => '',
				'api_base' => 'https://cdn.convor.io',
			)
		);
	}
}
