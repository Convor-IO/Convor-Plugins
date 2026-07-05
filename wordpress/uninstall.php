<?php
/**
 * Uninstall handler for Convor Live Chat.
 *
 * Fired when the plugin is deleted via the WordPress admin. Cleans up all
 * plugin data. Deactivation does NOT remove data.
 *
 * @package Convor
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

// Remove plugin options.
delete_option( 'convor_settings' );

// Clean up any orphaned site-level options in multisite.
if ( is_multisite() ) {
	$site_ids = get_sites( array( 'fields' => 'ids' ) );
	foreach ( $site_ids as $site_id ) {
		delete_blog_option( $site_id, 'convor_settings' );
	}
}
