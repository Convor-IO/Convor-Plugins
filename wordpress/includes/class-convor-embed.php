<?php
/**
 * Front-end widget embed for Convor Live Chat.
 *
 * @package Convor
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Echoes the Convor widget script tag into wp_footer.
 */
class Convor_Embed {

	/**
	 * Hook into the footer.
	 */
	public function __construct() {
		add_action( 'wp_footer', array( $this, 'render' ), 20 );
	}

	/**
	 * Build the final widget configuration, applying the `convor_widget_config`
	 * filter so other plugins/themes can override `key` and `apiBase`.
	 *
	 * @return array{key:string,api_base:string}
	 */
	public function get_config(): array {
		$defaults = convor_default_config();

		/**
		 * Filter the widget embed configuration.
		 *
		 * @since 1.0.0
		 *
		 * @param array{key:string,api_base:string} $config {
		 *     Widget embed configuration.
		 *
		 *     @type string $key     Organization public slug.
		 *     @type string $apiBase Widget CDN base URL.
		 * }
		 */
		$config = apply_filters( 'convor_widget_config', $defaults );

		$api_base = isset( $config['apiBase'] ) && is_string( $config['apiBase'] ) && '' !== $config['apiBase']
			? $config['apiBase']
			: $defaults['apiBase'];
		$key = isset( $config['key'] ) && is_string( $config['key'] ) ? $config['key'] : '';
		$widget_url = isset( $config['widgetUrl'] ) && is_string( $config['widgetUrl'] ) && '' !== $config['widgetUrl']
			? (string) $config['widgetUrl']
			: '';

		return array(
			'key'       => $key,
			'apiBase'   => rtrim( $api_base, '/' ),
			'widgetUrl' => $widget_url,
		);
	}

	/**
	 * Render the widget script tag in the footer.
	 *
	 * Skipped entirely when:
	 *  - the org slug (`key`) is empty, or
	 *  - the request is not the main front-end HTML view (admin, feed, ajax,
	 *    rest, preview, robots, etc.).
	 *
	 * @return void
	 */
	public function render(): void {
		// Never embed on admin, AJAX, REST, feeds, or previews.
		if ( is_admin() || wp_doing_ajax() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) {
			return;
		}
		if ( is_feed() || is_preview() || is_robots() || is_trackback() ) {
			return;
		}
		if ( wp_is_json_request() ) {
			return;
		}

		$config = $this->get_config();

		if ( '' === $config['key'] ) {
			return;
		}

		$src = trailingslashit( $config['apiBase'] ) . 'widget.js';

		// Respect analytics/privacy opt-out plugins that short-circuit footer scripts.
		if ( apply_filters( 'convor_disable_widget', false ) ) {
			return;
		}

		// Optional iframe URL override. Defaults to the loader's built-in
		// (cdn.convor.io/widget-iframe.html) when unset; the filter can set
		// it for self-hosted iframe deployments or local testing.
		$widget_url = isset( $config['widgetUrl'] ) && is_string( $config['widgetUrl'] ) && '' !== $config['widgetUrl']
			? (string) $config['widgetUrl']
			: '';

		if ( '' !== $widget_url ) {
			printf(
				"\n<!-- Convor Live Chat -->\n<script src=\"%s\" data-key=\"%s\" data-widget-url=\"%s\" async></script>\n",
				esc_url( $src ),
				esc_attr( $config['key'] ),
				esc_url( $widget_url )
			);
		} else {
			printf(
				"\n<!-- Convor Live Chat -->\n<script src=\"%s\" data-key=\"%s\" async></script>\n",
				esc_url( $src ),
				esc_attr( $config['key'] )
			);
		}
	}
}
