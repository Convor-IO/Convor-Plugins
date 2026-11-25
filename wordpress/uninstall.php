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

// Remove settings and the pending authorization from every site.
function convor_uninstall_site(): void {
	delete_option( 'convor_settings' );
	delete_transient( 'convor_widget_pairing' );
}
if ( is_multisite() ) {
	$convor_offset = 0;
	do {
		$convor_site_ids = get_sites( array( 'fields' => 'ids', 'number' => 100, 'offset' => $convor_offset, 'orderby' => 'id', 'order' => 'ASC' ) );
		foreach ( $convor_site_ids as $convor_site_id ) {
			switch_to_blog( (int) $convor_site_id );
			convor_uninstall_site();
			restore_current_blog();
		}
		$convor_offset += count( $convor_site_ids );
	} while ( count( $convor_site_ids ) === 100 );
} else {
	convor_uninstall_site();
}
