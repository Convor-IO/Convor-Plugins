<?php
/**
 * Per-site settings using the WordPress Settings API.
 *
 * @package Convor
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Convor_Settings {
	const OPTION_GROUP = 'convor_settings_group';
	const PAGE_SLUG = 'convor';
	const OPTION_NAME = 'convor_settings';

	public function __construct() {
		add_action( 'admin_menu', array( $this, 'register_menu' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( CONVOR_PLUGIN_FILE ), array( $this, 'action_links' ) );
	}

	public function register_menu(): void {
		add_options_page( __( 'Convor Live Chat', 'convor' ), __( 'Convor', 'convor' ), 'manage_options', self::PAGE_SLUG, array( $this, 'render_settings_page' ) );
	}

	public function action_links( array $links ): array {
		array_unshift( $links, '<a href="' . esc_url( admin_url( 'options-general.php?page=convor' ) ) . '">' . esc_html__( 'Settings', 'convor' ) . '</a>' );
		return $links;
	}

	public function register_settings(): void {
		register_setting(
			self::OPTION_GROUP,
			self::OPTION_NAME,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( $this, 'sanitize_settings' ),
				'default'           => convor_settings_defaults(),
			)
		);
	}

	/** Preserve an existing working configuration on invalid input. */
	public function sanitize_settings( $input ): array {
		$previous = convor_get_settings();
		if ( ! is_array( $input ) || ! is_string( $input['widget_key'] ?? null ) ) {
			add_settings_error( self::OPTION_NAME, 'invalid_key', __( 'Enter the public widget key for your website.', 'convor' ) );
			return $previous;
		}
		$key = trim( $input['widget_key'] );
		$challenge = $input['verification_challenge'] ?? '';
		if ( ( '' !== $key && ! convor_valid_widget_key( $key ) )
			|| ! is_string( $challenge )
			|| ( '' !== $challenge && ! convor_valid_verification_challenge( $challenge ) ) ) {
			add_settings_error( self::OPTION_NAME, 'invalid_config', __( 'The widget key or verification code is invalid. Your previous settings were kept.', 'convor' ) );
			return $previous;
		}

		return array(
			'widget_key'             => $key,
			'verification_challenge' => '' === $key ? '' : $challenge,
			'enabled'                => '' !== $key && ! empty( $input['enabled'] ),
			'consent_required'       => ! empty( $input['consent_required'] ),
		);
	}

	public function render_settings_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage these settings.', 'convor' ) );
		}
		$options = convor_get_settings();
		$configured = convor_valid_widget_key( $options['widget_key'] );
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'Convor Live Chat', 'convor' ); ?></h1>
			<p><strong><?php echo esc_html( get_bloginfo( 'name' ) ); ?></strong> · <?php echo esc_html( home_url( '/' ) ); ?></p>
			<p><?php esc_html_e( 'Connect this WordPress site to your Convor website. Manage the chat appearance and conversations in Convor.', 'convor' ); ?></p>
			<?php
			// The callback only puts a fixed status in the URL, never secrets.
			$pairing_status = isset( $_GET['convor_pairing'] ) && is_string( $_GET['convor_pairing'] ) ? sanitize_key( wp_unslash( $_GET['convor_pairing'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			if ( 'success' === $pairing_status && $configured ) :
				?>
				<div class="notice notice-success"><p><?php esc_html_e( 'Website connected. Open your website to test the chat.', 'convor' ); ?></p></div>
			<?php elseif ( 'failed' === $pairing_status ) : ?>
				<div class="notice notice-error"><p><?php esc_html_e( 'Connection could not be completed. Your existing settings were kept. Start again or enter the widget key manually.', 'convor' ); ?></p></div>
			<?php endif; ?>
			<p>
				<a class="button button-primary" href="<?php echo esc_url( Convor_Pairing::start_url() ); ?>"><?php esc_html_e( 'Connect with Convor', 'convor' ); ?></a>
				<a class="button" href="<?php echo esc_url( CONVOR_DASHBOARD_URL . '/settings/widget/installation' ); ?>" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'Open Convor installation', 'convor' ); ?></a>
				<a class="button" href="<?php echo esc_url( CONVOR_DASHBOARD_URL ); ?>" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'Open Convor dashboard', 'convor' ); ?></a>
			</p>
			<p><?php esc_html_e( 'Connecting enables the Convor chat service for the website you choose. If you require visitor consent, save that setting below before connecting.', 'convor' ); ?></p>
			<h2><?php esc_html_e( 'Widget settings', 'convor' ); ?></h2>
			<p><strong><?php
				if ( ! $configured ) {
					esc_html_e( 'Not configured', 'convor' );
				} elseif ( empty( $options['enabled'] ) ) {
					esc_html_e( 'Disabled', 'convor' );
				} else {
					esc_html_e( 'Configured — test the chat on your website', 'convor' );
				}
			?></strong></p>
			<form action="options.php" method="post">
				<?php settings_fields( self::OPTION_GROUP ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="convor_widget_key"><?php esc_html_e( 'Website widget key', 'convor' ); ?></label></th>
						<td>
							<input class="regular-text code" id="convor_widget_key" name="convor_settings[widget_key]" type="text" value="<?php echo esc_attr( $options['widget_key'] ); ?>" placeholder="convor_wpk_..." autocomplete="off" spellcheck="false" />
							<p class="description"><?php esc_html_e( 'Copy the public widget key from the installation settings of the correct website in Convor. Never enter an API key or password here.', 'convor' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="convor_verification_challenge"><?php esc_html_e( 'Website verification code (optional)', 'convor' ); ?></label></th>
						<td>
							<input class="regular-text code" id="convor_verification_challenge" name="convor_settings[verification_challenge]" type="text" value="<?php echo esc_attr( $options['verification_challenge'] ); ?>" autocomplete="off" spellcheck="false" />
							<p class="description"><?php esc_html_e( 'If Convor asks you to verify ownership, copy the data-convor-verification value from its installation code. Clear it when no longer needed.', 'convor' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Live chat', 'convor' ); ?></th>
						<td><label><input type="checkbox" name="convor_settings[enabled]" value="1" <?php checked( ! empty( $options['enabled'] ) ); ?> /> <?php esc_html_e( 'Enable Convor on public pages', 'convor' ); ?></label>
							<p class="description"><?php esc_html_e( 'Enabling loads the Convor service on your website. See the privacy policy and terms of service before enabling it.', 'convor' ); ?>
								<a href="https://convor.io/privacy" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'Privacy policy', 'convor' ); ?></a> ·
								<a href="https://convor.io/terms" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'Terms of service', 'convor' ); ?></a>
							</p>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Visitor consent', 'convor' ); ?></th>
						<td><label><input type="checkbox" name="convor_settings[consent_required]" value="1" <?php checked( ! empty( $options['consent_required'] ) ); ?> /> <?php esc_html_e( 'Wait for consent before loading Convor', 'convor' ); ?></label>
							<p class="description"><?php esc_html_e( 'Requires a compatible consent manager using the WP Consent API (marketing category), or a developer-provided consent integration. Without consent, the widget stays off.', 'convor' ); ?></p>
						</td>
					</tr>
				</table>
				<?php submit_button( __( 'Save settings', 'convor' ) ); ?>
			</form>
			<?php if ( $configured && ! empty( $options['enabled'] ) ) : ?>
				<p><a class="button" href="<?php echo esc_url( home_url( '/' ) ); ?>" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'Open website and test chat', 'convor' ); ?></a></p>
				<p><?php esc_html_e( 'Open the public website, send a message and reply from the Convor inbox to confirm the installation. Clear any page cache after changing settings.', 'convor' ); ?></p>
			<?php endif; ?>
			<p><?php esc_html_e( 'To disconnect, clear the widget key and save. This does not delete your conversations or remove separately installed theme code.', 'convor' ); ?></p>
			<p>
				<a href="<?php echo esc_url( CONVOR_DASHBOARD_URL . '/conversations' ); ?>" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'Open Convor inbox', 'convor' ); ?></a> ·
				<a href="<?php echo esc_url( 'https://convor.io/' . ( 0 === strpos( get_user_locale(), 'pl' ) ? 'pl' : 'en' ) . '/docs/integrations/wordpress-integration' ); ?>" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'Installation guide', 'convor' ); ?></a> ·
				<?php
				/* translators: %s: plugin version. */
				printf( esc_html__( 'Version %s', 'convor' ), esc_html( CONVOR_VERSION ) );
				?>
			</p>
		</div>
		<?php
	}
}
