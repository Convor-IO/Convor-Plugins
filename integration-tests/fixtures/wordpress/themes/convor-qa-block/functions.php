<?php
// Test fixture: equivalent of adding the copied public snippet site-wide in
// a block child theme. No Convor WordPress plugin is required.
add_action( 'wp_footer', static function () {
	$key = get_option( 'convor_qa_theme_public_key' );
	$src = ( getenv( 'CONVOR_FIXTURE_PUBLIC_API_URL' ) ?: 'http://localhost:17203' ) . '/widget.js';
	if ( is_string( $key ) && preg_match( '/^convor_wpk_[a-f0-9]{64}$/D', $key ) ) {
		printf( '<script src="%s" data-key="%s" async></script>', esc_url( $src ), esc_attr( $key ) );
	}
}, 20 );
