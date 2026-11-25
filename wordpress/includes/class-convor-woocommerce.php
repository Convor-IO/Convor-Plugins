<?php
/**
 * Public product context and session-local WooCommerce cart context.
 *
 * @package Convor
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Convor_WooCommerce {
	const HANDLE = 'convor-woocommerce-context';

	private Convor_Embed $embed;
	private ?array $context = null;

	public function __construct( Convor_Embed $embed ) {
		$this->embed = $embed;
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue' ), 20 );
		add_filter( 'script_loader_tag', array( $this, 'script_tag' ), 10, 3 );
	}

	public function enqueue(): void {
		$config = $this->embed->get_active_config();
		if ( null === $config || ! function_exists( 'wc_get_product' ) ) {
			return;
		}

		// Only product metadata is emitted into HTML, never a customer's
		// cart, account identifiers, email or order data (page caches).
		$attributes = array(
			'productId'    => null,
			'productName'  => null,
			'productPrice' => null,
			'currency'     => get_woocommerce_currency(),
			'viewing'      => null,
		);
		$product = null;
		if ( function_exists( 'is_product' ) && is_product() ) {
			$product = wc_get_product( get_queried_object_id() );
			if ( $product instanceof WC_Product ) {
				$attributes['productId'] = $product->get_id();
				$attributes['productName'] = $product->get_name();
				$attributes['productPrice'] = $product->is_type( 'variable' )
					? null : wc_format_decimal( wc_get_price_to_display( $product ), '' );
				$attributes['viewing'] = 'product';
				$attributes = apply_filters( 'convor_woocommerce_attributes', $attributes, $product );
			}
		}

		$this->context = array(
			'key'        => $config['key'],
			'attributes' => $attributes,
			'cartUrl'    => rest_url( 'wc/store/v1/cart' ),
			'deferred'   => $config['deferred'],
		);

		wp_enqueue_script( self::HANDLE, CONVOR_PLUGIN_URL . 'assets/js/woocommerce.js', array( Convor_Embed::HANDLE ), CONVOR_VERSION, true );
	}

	public function script_tag( string $tag, string $handle, string $src ): string {
		if ( self::HANDLE !== $handle || null === $this->context ) {
			return $tag;
		}
		$json = wp_json_encode( $this->context, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT );
		if ( false === $json ) {
			return '';
		}
		return wp_get_script_tag( array(
			'id'                  => self::HANDLE . '-js',
			'src'                 => $src,
			'data-convor-context' => $json,
		) );
	}
}
