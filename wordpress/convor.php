<?php
/**
 * Plugin Name: Convor Live Chat
 * Plugin URI: https://convor.io
 * Description: Connect your WordPress site to Convor and add live chat.
 * Version: 1.0.0
 * Requires at least: 6.0
 * Requires PHP: 8.0
 * Author: Convor
 * Author URI: https://convor.io
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: convor
 * Domain Path: /languages
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
define( 'CONVOR_CDN_BASE', 'https://cdn.convor.io' );
if ( ! defined( 'CONVOR_DASHBOARD_URL' ) ) {
	define( 'CONVOR_DASHBOARD_URL', 'https://dashboard.convor.io' );
}
if ( ! defined( 'CONVOR_API_BASE' ) ) {
	define( 'CONVOR_API_BASE', 'https://api.convor.io' );
}

require_once CONVOR_PLUGIN_DIR . 'includes/class-convor-settings.php';
require_once CONVOR_PLUGIN_DIR . 'includes/class-convor-pairing.php';
require_once CONVOR_PLUGIN_DIR . 'includes/class-convor-embed.php';
require_once CONVOR_PLUGIN_DIR . 'includes/class-convor-woocommerce.php';

/** Return the defaults for this WordPress site (not the multisite network). */
function convor_settings_defaults(): array {
	return array(
		'widget_key'             => '',
		'verification_challenge' => '',
		'enabled'                => false,
		'consent_required'       => false,
	);
}

/** The public key is issued by Convor for exactly one website. */
function convor_valid_widget_key( $key ): bool {
	return is_string( $key ) && 1 === preg_match( '/\Aconvor_wpk_[a-f0-9]{64}\z/', $key );
}

/** Domain ownership proof is an opaque, URL-safe token, not a credential. */
function convor_valid_verification_challenge( $challenge ): bool {
	return is_string( $challenge ) && 1 === preg_match( '/\A[A-Za-z0-9_-]{1,256}\z/', $challenge );
}

/** Merge current site options with defaults; never interpret a slug as a key. */
function convor_get_settings(): array {
	$options = get_option( 'convor_settings', array() );
	$defaults = convor_settings_defaults();
	if ( ! is_array( $options ) ) {
		return $defaults;
	}
	// Older installations could already contain the exact public key in
	// org_slug. Preserve that installation, never an obsolete slug or CDN
	// override. An explicitly saved empty widget_key must stay disconnected.
	if ( ! array_key_exists( 'widget_key', $options ) && convor_valid_widget_key( $options['org_slug'] ?? null ) ) {
		$options['widget_key'] = $options['org_slug'];
		if ( ! array_key_exists( 'enabled', $options ) ) {
			$options['enabled'] = true;
		}
	}
	return array_replace( $defaults, array_intersect_key( $options, $defaults ) );
}

add_action( 'plugins_loaded', 'convor_init' );
function convor_init(): void {
	new Convor_Settings();
	new Convor_Pairing();
	$embed = new Convor_Embed();
	if ( class_exists( 'WooCommerce' ) ) {
		new Convor_WooCommerce( $embed );
	}
}

add_action( 'init', 'convor_load_translations' );
function convor_load_translations(): void {
	// ZIP installs also need the bundled translations when no directory language pack exists.
	// phpcs:ignore PluginCheck.CodeAnalysis.DiscouragedFunctions.load_plugin_textdomainFound -- supports offline/ZIP installations.
	load_plugin_textdomain( 'convor', false, dirname( plugin_basename( CONVOR_PLUGIN_FILE ) ) . '/languages' );
}

register_activation_hook( __FILE__, 'convor_activate' );
function convor_activate(): void {
	add_option( 'convor_settings', convor_settings_defaults() );
}
