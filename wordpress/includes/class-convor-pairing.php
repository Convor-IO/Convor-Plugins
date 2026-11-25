<?php
/**
 * Browser-mediated installation authorization with a one-use verifier.
 *
 * @package Convor
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Convor_Pairing {
	const START_ACTION = 'convor_pair_start';
	const COMPLETE_ACTION = 'convor_pair_complete';
	const TTL = 10 * MINUTE_IN_SECONDS;
	const TRANSIENT = 'convor_widget_pairing';

	public function __construct() {
		add_action( 'admin_post_' . self::START_ACTION, array( $this, 'start' ) );
		add_action( 'admin_post_' . self::COMPLETE_ACTION, array( $this, 'complete' ) );
	}

	public static function start_url(): string {
		return wp_nonce_url( admin_url( 'admin-post.php?action=' . self::START_ACTION ), self::START_ACTION );
	}

	private static function callback_url(): string {
		return admin_url( 'admin-post.php?action=' . self::COMPLETE_ACTION );
	}

	private static function require_admin(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage these settings.', 'convor' ), '', array( 'response' => 403 ) );
		}
	}

	private static function session_binding(): string {
		return hash( 'sha256', get_current_user_id() . ':' . wp_get_session_token() );
	}

	private static function finish( string $result ): void {
		wp_safe_redirect( add_query_arg( 'convor_pairing', $result, admin_url( 'options-general.php?page=convor' ) ) );
		exit;
	}

	public function start(): void {
		self::require_admin();
		check_admin_referer( self::START_ACTION );
		$state = bin2hex( random_bytes( 32 ) );
		$verifier = bin2hex( random_bytes( 32 ) );
		$callback = self::callback_url();
		$site_url = home_url( '/' );
		// Network activation may not have created this site's option.
		add_option( 'convor_settings', convor_settings_defaults() );
		$settings = get_option( 'convor_settings' );
		if ( ! is_array( $settings ) ) {
			self::finish( 'failed' );
		}
		$stored = set_transient(
			self::TRANSIENT,
			array(
				'state'    => $state,
				'verifier' => $verifier,
				'session'  => self::session_binding(),
				'callback' => $callback,
				'settings' => $settings,
			),
			self::TTL
		);
		if ( ! $stored ) {
			self::finish( 'failed' );
		}

		$url = add_query_arg(
			array(
				'wp_site'     => $site_url,
				'wp_callback' => $callback,
				'wp_state'    => $state,
				'wp_proof'    => hash( 'sha256', $verifier ),
			),
			CONVOR_DASHBOARD_URL . '/integrations/wordpress'
		);
		// This URL's destination is a fixed Convor service, never user input.
		nocache_headers();
		header( 'Referrer-Policy: no-referrer' );
		wp_redirect( $url ); // phpcs:ignore WordPress.Security.SafeRedirect.wp_redirect_wp_redirect -- fixed external Convor host.
		exit;
	}

	public function complete(): void {
		self::require_admin();
		// The high-entropy, session-bound, expiring state is this cross-site
		// callback's CSRF protection. A WP action nonce is checked at start.
		$state = isset( $_GET['state'] ) && is_string( $_GET['state'] ) ? sanitize_text_field( wp_unslash( $_GET['state'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$code = isset( $_GET['code'] ) && is_string( $_GET['code'] ) ? sanitize_text_field( wp_unslash( $_GET['code'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( ! preg_match( '/\A[a-f0-9]{64}\z/', $state ) || ! preg_match( '/\A[A-Za-z0-9_-]{32}\z/', $code ) ) {
			self::finish( 'failed' );
		}

		$grant = get_transient( self::TRANSIENT );
		if ( ! is_array( $grant ) || ! isset( $grant['state'], $grant['session'], $grant['verifier'], $grant['callback'], $grant['settings'] )
			|| ! hash_equals( $grant['state'], $state )
			|| ! hash_equals( $grant['session'], self::session_binding() )
			|| $grant['callback'] !== self::callback_url()
			|| $grant['settings'] !== get_option( 'convor_settings' ) ) {
			self::finish( 'failed' );
		}

		// Consume local state before network I/O. A failed exchange can be
		// retried by initiating a fresh pairing. The API also consumes once.
		if ( ! delete_transient( self::TRANSIENT ) ) {
			self::finish( 'failed' );
		}
		$response = wp_safe_remote_post(
			CONVOR_API_BASE . '/api/wordpress/pairing/redeem',
			array(
				'timeout'     => 10,
				'redirection' => 0,
				'headers'     => array( 'Content-Type' => 'application/json', 'Accept' => 'application/json' ),
				'body'        => wp_json_encode( array(
					'state'    => $state,
					'code'     => $code,
					'verifier' => $grant['verifier'],
					'callback' => $grant['callback'],
				) ),
			)
		);
		if ( is_wp_error( $response ) || 200 !== wp_remote_retrieve_response_code( $response ) ) {
			self::finish( 'failed' );
		}
		$payload = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( ! is_array( $payload ) || ! convor_valid_widget_key( $payload['widgetKey'] ?? null ) ) {
			self::finish( 'failed' );
		}

		// A concurrent settings edit or another pairing must never be
		// overwritten by an older callback that finishes later.
		if ( false !== get_transient( self::TRANSIENT ) ) {
			self::finish( 'failed' );
		}
		$settings = array_replace( convor_settings_defaults(), $grant['settings'] );
		$settings = array_intersect_key( $settings, convor_settings_defaults() );
		$settings['verification_challenge'] = $settings['widget_key'] === $payload['widgetKey'] ? $settings['verification_challenge'] : '';
		$settings['widget_key'] = $payload['widgetKey'];
		$settings['enabled'] = true;
		if ( ! self::replace_settings( $grant['settings'], $settings ) ) {
			self::finish( 'failed' );
		}
		self::finish( 'success' );
	}

	/**
	 * WordPress update_option() has no compare-and-swap operation. A late
	 * pairing must not overwrite a manual edit or a newer pairing.
	 */
	private static function replace_settings( array $previous, array $next ): bool {
		global $wpdb;
		if ( $previous === $next ) {
			return $previous === get_option( 'convor_settings' );
		}
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- atomic conditional write; invalidate caches below.
		$updated = $wpdb->query( $wpdb->prepare(
			"UPDATE {$wpdb->options} SET option_value = %s WHERE option_name = %s AND BINARY option_value = BINARY %s",
			maybe_serialize( $next ),
			'convor_settings',
			maybe_serialize( $previous )
		) );
		if ( 1 !== $updated ) {
			return false;
		}
		wp_cache_delete( 'convor_settings', 'options' );
		wp_cache_delete( 'alloptions', 'options' );
		// Preserve WordPress's post-update option hooks after the atomic write.
		// phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- WordPress core hook.
		do_action( 'update_option_convor_settings', $previous, $next, 'convor_settings' );
		// phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- WordPress core hook.
		do_action( 'updated_option', 'convor_settings', $previous, $next );
		return true;
	}
}
