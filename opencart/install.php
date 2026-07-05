<?php
/**
 * Convor widget module — installer.
 *
 * Runs when the module is installed and registers the storefront event that
 * injects the Convor `<script>` tag into the header. OpenCart 4 has two
 * install paths; this file covers the manual / zip-distribution one:
 *
 *   - Extensions manager install: auto-calls Admin\Controller\Module\Convor::install()
 *     (which performs the identical registration).
 *   - Manual file copy / OCMOD zip: this install.php is executed by the
 *     admin installer after files are in place.
 *
 * In both cases the registry is available as $registry, so we resolve the
 * events model through it rather than a controller base class.
 *
 * @var \Opencart\System\Engine\Registry $registry
 */

if (!defined('DIR_APPLICATION')) {
	// Guard against being executed outside of OpenCart (e.g. `php install.php`
	// from the CLI during development). No-op instead of fatal error.
	return;
}

/** @var \Opencart\System\Engine\Registry $registry */
$model = $registry->get('model_setting_event');

if ($model) {
	// idempotent: remove any prior registration before re-adding.
	$model->deleteEventByCode('convor_widget');

	$model->addEvent([
		'code'        => 'convor_widget',
		'description' => 'Injects the Convor live-chat widget script into the storefront header.',
		'trigger'     => 'catalog/view/common/header/after',
		'action'      => 'module/convor.injectScript',
		'status'      => 1,
		'sort_order'  => 1,
	]);
}
