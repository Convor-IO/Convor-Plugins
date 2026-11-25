<?php
/**
 * Front-end widget installation. Appearance and visitor authorization live in Convor.
 *
 * @package Convor
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Convor_Embed {
	const HANDLE = 'convor-live-chat';

	/** The configuration for this public request, shared with WooCommerce. */
	private ?array $active_config = null;

	public function __construct() {
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue' ) );
		add_filter( 'script_loader_tag', array( $this, 'script_tag' ), 10, 3 );
	}

	/** Return null unless this request is permitted to load the integration. */
	public function get_active_config(): ?array {
		return $this->active_config;
	}

	public function enqueue(): void {
		if ( is_admin() || wp_doing_ajax() || ( defined( 'REST_REQUEST' ) && REST_REQUEST )
			|| is_feed() || is_preview() || is_robots() || is_trackback() || wp_is_json_request() ) {
			return;
		}

		$options = convor_get_settings();
		if ( empty( $options['enabled'] ) || apply_filters( 'convor_disable_widget', false ) ) {
			return;
		}

		$config = apply_filters(
			'convor_widget_config',
			array(
				'key'       => $options['widget_key'],
				'apiBase'   => CONVOR_CDN_BASE,
				'widgetUrl' => '',
			)
		);
		if ( ! is_array( $config ) || ! convor_valid_widget_key( $config['key'] ?? null ) ) {
			return;
		}

		// An explicit server-side allow filter is useful for uncached sites.
		// Otherwise use the local consent bootstrap (no remote request until opt-in).
		$decision = apply_filters( 'convor_allow_widget', null );
		if ( false === $decision ) {
			return;
		}
		$deferred = true !== $decision && ! empty( $options['consent_required'] );
		if ( $deferred && ! function_exists( 'wp_has_consent' ) ) {
			return;
		}

		$challenge = $options['widget_key'] === $config['key'] && convor_valid_verification_challenge( $options['verification_challenge'] )
			? $options['verification_challenge'] : '';
		$base = is_string( $config['apiBase'] ?? null ) ? $config['apiBase'] : CONVOR_CDN_BASE;
		$this->active_config = array(
			'key'       => $config['key'],
			'src'       => trailingslashit( $base ) . 'widget.js',
			'widgetUrl' => is_string( $config['widgetUrl'] ?? null ) ? $config['widgetUrl'] : '',
			'challenge' => $challenge,
			'deferred'  => $deferred,
		);

		wp_enqueue_script(
			self::HANDLE,
			$deferred ? CONVOR_PLUGIN_URL . 'assets/js/consent.js' : $this->active_config['src'],
			array(),
			$deferred ? CONVOR_VERSION : null,
			true
		);
	}

	/** Emit the same public attributes as the Convor dashboard's snippet. */
	public function script_tag( string $tag, string $handle, string $src ): string {
		if ( self::HANDLE !== $handle || null === $this->active_config ) {
			return $tag;
		}

		$config = $this->active_config;
		$attributes = array(
			'id'       => self::HANDLE . '-js',
			'src'      => $src,
			'data-key' => $config['key'],
			'async'    => true,
		);
		if ( '' !== $config['challenge'] ) {
			$attributes['data-convor-verification'] = $config['challenge'];
		}
		if ( '' !== $config['widgetUrl'] ) {
			$attributes['data-widget-url'] = $config['widgetUrl'];
		}
		if ( $config['deferred'] ) {
			$attributes['data-convor-src'] = $config['src'];
		}

		return wp_get_script_tag( $attributes );
	}
}
