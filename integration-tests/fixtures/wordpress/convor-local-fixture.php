<?php
/**
 * Test-only MU plugin. Never included in the release ZIP.
 * The WordPress fixture is on the isolated Convor dev network.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
define( 'CONVOR_DASHBOARD_URL', getenv( 'CONVOR_FIXTURE_DASHBOARD_URL' ) ?: 'http://localhost:17204' );
define( 'CONVOR_API_BASE', getenv( 'CONVOR_FIXTURE_API_URL' ) ?: 'http://server:3000' );
add_filter( 'convor_widget_config', static function ( $config ) {
	$base = getenv( 'CONVOR_FIXTURE_PUBLIC_API_URL' ) ?: 'http://localhost:17203';
	$config['apiBase'] = $base;
	$config['widgetUrl'] = rtrim( $base, '/' ) . '/widget-iframe.html';
	return $config;
} );
// The real WP Consent API is installed separately. This test-only driver
// selects the CMP opt-in mode; its actual JavaScript API persists visitor choices.
add_filter( 'wp_get_consent_type', static function ( $type ) {
	return get_option( 'convor_qa_cmp_optin', false ) ? 'optin' : $type;
} );
// WordPress's SSRF defense remains on, except for our explicit fixture API.
add_filter( 'http_request_host_is_external', static function ( $external, $host, $url ) {
	return $external || ( $host === wp_parse_url( CONVOR_API_BASE, PHP_URL_HOST )
		&& $url === CONVOR_API_BASE . '/api/wordpress/pairing/redeem' );
}, 10, 3 );
add_filter( 'http_allowed_safe_ports', static function ( $ports, $host, $url ) {
	if ( $url === CONVOR_API_BASE . '/api/wordpress/pairing/redeem' ) {
		$ports[] = (int) wp_parse_url( CONVOR_API_BASE, PHP_URL_PORT );
	}
	return $ports;
}, 10, 3 );
