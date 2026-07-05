<?php
/**
 * WooCommerce integration for Convor Live Chat.
 *
 * Pushes product context to the visitor SDK on WooCommerce product pages.
 *
 * @package Convor
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Enriches the embedded widget with WooCommerce product/cart context.
 *
 * Loaded only when WooCommerce is active (guarded in convor.php via
 * `class_exists('WooCommerce')`).
 */
class Convor_WooCommerce {

	/**
	 * Hook into wp_footer, after the embed is rendered.
	 */
	public function __construct() {
		add_action( 'wp_footer', array( $this, 'render_product_context' ), 25 );
	}

	/**
	 * Render an inline script that pushes product context to the visitor SDK
	 * when the current request is a single WooCommerce product page.
	 *
	 * @return void
	 */
	public function render_product_context(): void {
		// Bail out early if WooCommerce isn't present at runtime for any reason.
		if ( ! function_exists( 'wc_get_product' ) ) {
			return;
		}

		// Only on single product pages.
		if ( ! function_exists( 'is_product' ) || ! is_product() ) {
			return;
		}

		global $product;

		if ( ! $product instanceof WC_Product ) {
			$product = wc_get_product( get_the_ID() );
		}

		if ( ! $product instanceof WC_Product ) {
			return;
		}

		$product_id   = $product->get_id();
		$product_name = $product->get_name();
		$product_price = $product->get_price();
		$currency     = $this->get_currency();
		$cart_total   = $this->get_cart_total();

		$attributes = array(
			'productId'    => $product_id,
			'productName'  => $product_name,
			'productPrice' => wc_format_decimal( $product_price, '' ),
			'currency'     => $currency,
			'cartTotal'    => $cart_total,
			'viewing'      => 'product',
		);

		/**
		 * Filter the WooCommerce attributes pushed to the Convor visitor SDK.
		 *
		 * @since 1.0.0
		 *
		 * @param array<string,mixed> $attributes Attributes to send.
		 * @param WC_Product          $product    The current WooCommerce product.
		 */
		$attributes = apply_filters( 'convor_woocommerce_attributes', $attributes, $product );

		// Strip empty values to keep the payload tidy.
		$attributes = array_filter( $attributes, array( $this, 'is_not_empty' ) );

		if ( empty( $attributes ) ) {
			return;
		}

		$json = wp_json_encode( $attributes );
		if ( false === $json ) {
			return;
		}
		?>
<script>
(function () {
	var attributes = <?php echo $json; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>;
	if (window.Convor && typeof window.Convor.setAttributes === "function") {
		window.Convor.setAttributes(attributes);
	} else {
		window.__convorQueue = window.__convorQueue || [];
		window.__convorQueue.push(attributes);
	}
})();
</script>
		<?php
	}

	/**
	 * Get the active WooCommerce currency code.
	 *
	 * @return string Currency code (e.g. USD), or '' if unavailable.
	 */
	protected function get_currency(): string {
		if ( function_exists( 'get_woocommerce_currency' ) ) {
			return get_woocommerce_currency();
		}
		return '';
	}

	/**
	 * Get the WooCommerce cart total as a numeric string.
	 *
	 * @return string
	 */
	protected function get_cart_total(): string {
		if ( ! function_exists( 'WC' ) ) {
			return '';
		}

		$cart = WC()->cart ?? null;
		if ( null === $cart ) {
			return '';
		}

		$total = method_exists( $cart, 'get_cart_contents_total' )
			? $cart->get_cart_contents_total()
			: '';
		return '' !== $total ? wc_format_decimal( $total, '' ) : '';
	}

	/**
	 * Helper for array_filter: keep values that aren't empty strings or null.
	 *
	 * @param mixed $value Value to test.
	 * @return bool
	 */
	protected function is_not_empty( $value ): bool {
		if ( null === $value ) {
			return false;
		}
		if ( is_string( $value ) && '' === trim( $value ) ) {
			return false;
		}
		return true;
	}
}
