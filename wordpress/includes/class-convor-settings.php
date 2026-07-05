<?php
/**
 * Settings page for Convor Live Chat.
 *
 * @package Convor
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Registers and renders the Settings → Convor page using the WordPress Settings API.
 */
class Convor_Settings {

	/**
	 * Option group / page slug.
	 *
	 * @var string
	 */
	const OPTION_GROUP = 'convor_settings_group';

	/**
	 * Settings page slug.
	 *
	 * @var string
	 */
	const PAGE_SLUG = 'convor';

	/**
	 * Option name in the options table.
	 *
	 * @var string
	 */
	const OPTION_NAME = 'convor_settings';

	/**
	 * Section id.
	 *
	 * @var string
	 */
	const SECTION_ID = 'convor_main_section';

	/**
	 * Hook into admin.
	 */
	public function __construct() {
		add_action( 'admin_menu', array( $this, 'register_menu' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_admin_assets' ) );
	}

	/**
	 * Add the settings page under Settings → Convor.
	 *
	 * @return void
	 */
	public function register_menu(): void {
		add_options_page(
			__( 'Convor Live Chat', 'convor' ),
			__( 'Convor', 'convor' ),
			'manage_options',
			self::PAGE_SLUG,
			array( $this, 'render_settings_page' )
		);
	}

	/**
	 * Register settings, section, and fields.
	 *
	 * @return void
	 */
	public function register_settings(): void {
		register_setting(
			self::OPTION_GROUP,
			self::OPTION_NAME,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( $this, 'sanitize_settings' ),
				'default'           => array(
					'org_slug' => '',
					'api_base' => 'https://cdn.convor.io',
				),
			)
		);

		add_settings_section(
			self::SECTION_ID,
			__( 'Widget Settings', 'convor' ),
			array( $this, 'render_section_intro' ),
			self::PAGE_SLUG
		);

		add_settings_field(
			'convor_org_slug',
			__( 'Organization Slug', 'convor' ),
			array( $this, 'render_org_slug_field' ),
			self::PAGE_SLUG,
			self::SECTION_ID,
			array(
				'label_for' => 'convor_org_slug',
			)
		);

		add_settings_field(
			'convor_api_base',
			__( 'Widget CDN Base URL', 'convor' ),
			array( $this, 'render_api_base_field' ),
			self::PAGE_SLUG,
			self::SECTION_ID,
			array(
				'label_for' => 'convor_api_base',
			)
		);
	}

	/**
	 * Sanitize and validate the posted settings.
	 *
	 * @param mixed $input Raw input from the form.
	 * @return array{org_slug:string,api_base:string} Sanitized settings.
	 */
	public function sanitize_settings( $input ): array {
		$sanitized = array(
			'org_slug' => '',
			'api_base' => 'https://cdn.convor.io',
		);

		// Org slug: lowercase slug characters only (a-z 0-9 - _).
		if ( isset( $input['org_slug'] ) ) {
			$raw  = strtolower( (string) $input['org_slug'] );
			// Strip anything that isn't a slug character.
			$slug = preg_replace( '/[^a-z0-9_-]/', '', $raw ) ?? '';
			// Collapse runs of separators and trim leading/trailing ones.
			$slug = preg_replace( '/[-_]{2,}/', '-', $slug ) ?? '';
			$slug = trim( $slug, '-_' );
			if ( '' === $slug ) {
				add_settings_error(
					self::OPTION_NAME,
					'convor_org_slug_required',
					__( 'Organization slug is required to display the widget. Please enter the slug from your Convor dashboard (Settings → Widget).', 'convor' ),
					'error'
				);
			} else {
				$sanitized['org_slug'] = $slug;
			}
		} else {
			add_settings_error(
				self::OPTION_NAME,
				'convor_org_slug_required',
				__( 'Organization slug is required to display the widget.', 'convor' ),
				'error'
			);
		}

		// API base: must be a valid URL.
		if ( isset( $input['api_base'] ) && '' !== trim( (string) $input['api_base'] ) ) {
			$raw   = trim( (string) $input['api_base'] );
			$clean = esc_url_raw( $raw );
			if ( '' === $clean || ! preg_match( '#^https?://#i', $clean ) ) {
				add_settings_error(
					self::OPTION_NAME,
					'convor_api_base_invalid',
					__( 'Widget CDN Base URL must be a valid http(s) URL. Using the default.', 'convor' ),
					'error'
				);
			} else {
				$sanitized['api_base'] = rtrim( $clean, '/' );
			}
		}

		return $sanitized;
	}

	/**
	 * Render the section description.
	 *
	 * @return void
	 */
	public function render_section_intro(): void {
		echo '<p class="description">' . esc_html__( 'Configure how the Convor widget embeds on your site. Find your Organization Slug in the Convor dashboard under Settings → Widget.', 'convor' ) . '</p>';
	}

	/**
	 * Render the org slug input.
	 *
	 * @return void
	 */
	public function render_org_slug_field(): void {
		$options = get_option( self::OPTION_NAME, array() );
		$value   = isset( $options['org_slug'] ) ? (string) $options['org_slug'] : '';
		?>
		<input
			type="text"
			id="convor_org_slug"
			name="<?php echo esc_attr( self::OPTION_NAME ); ?>[org_slug]"
			value="<?php echo esc_attr( $value ); ?>"
			class="regular-text code convor-input"
			placeholder="my-company"
			autocomplete="off"
			spellcheck="false"
		/>
		<p class="description"><?php esc_html_e( 'Your organization\'s public slug, as shown in the Convor dashboard. Lowercase letters, numbers, hyphens and underscores only.', 'convor' ); ?></p>
		<?php
	}

	/**
	 * Render the apiBase input.
	 *
	 * @return void
	 */
	public function render_api_base_field(): void {
		$options = get_option( self::OPTION_NAME, array() );
		$value   = isset( $options['api_base'] ) && '' !== $options['api_base']
			? (string) $options['api_base']
			: 'https://cdn.convor.io';
		?>
		<input
			type="url"
			id="convor_api_base"
			name="<?php echo esc_attr( self::OPTION_NAME ); ?>[api_base]"
			value="<?php echo esc_attr( $value ); ?>"
			class="regular-text code convor-input"
			placeholder="https://cdn.convor.io"
			autocomplete="off"
			spellcheck="false"
		/>
		<p class="description"><?php esc_html_e( 'Base URL serving widget.js. Change only if Convor support instructs you to. Defaults to https://cdn.convor.io.', 'convor' ); ?></p>
		<?php
	}

	/**
	 * Render the full settings page.
	 *
	 * @return void
	 */
	public function render_settings_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage these settings.', 'convor' ) );
		}
		?>
		<div class="wrap convor-settings">
			<h1>
				<span class="convor-logo" aria-hidden="true">◆</span>
				<?php echo esc_html__( 'Convor Live Chat', 'convor' ); ?>
			</h1>
			<p class="convor-lead"><?php esc_html_e( 'Add live chat to your WordPress site in under a minute.', 'convor' ); ?></p>

			<form action="options.php" method="post">
				<?php
				settings_fields( self::OPTION_GROUP );
				do_settings_sections( self::PAGE_SLUG );
				submit_button( __( 'Save Settings', 'convor' ) );
				?>
			</form>

			<div class="convor-card">
				<h2><?php esc_html_e( 'Where do I find my Organization Slug?', 'convor' ); ?></h2>
				<p><?php esc_html_e( 'Sign in to your Convor dashboard, open Settings → Widget, and copy the public slug. It looks like my-company.', 'convor' ); ?></p>
				<p>
					<a class="button button-secondary" href="https://convor.io" target="_blank" rel="noopener noreferrer">
						<?php esc_html_e( 'Open Convor Dashboard', 'convor' ); ?> ↗
					</a>
				</p>
			</div>
		</div>
		<?php
	}

	/**
	 * Enqueue admin CSS/JS only on the Convor settings page.
	 *
	 * @param string $hook The current admin page hook suffix.
	 * @return void
	 */
	public function enqueue_admin_assets( string $hook ): void {
		if ( 'settings_page_' . self::PAGE_SLUG !== $hook ) {
			return;
		}
		wp_enqueue_style(
			'convor-admin-css',
			CONVOR_PLUGIN_URL . 'assets/css/admin.css',
			array(),
			CONVOR_VERSION
		);
		wp_enqueue_script(
			'convor-admin-js',
			CONVOR_PLUGIN_URL . 'assets/js/admin.js',
			array(),
			CONVOR_VERSION,
			true
		);
	}
}
