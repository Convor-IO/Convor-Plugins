<?php
/**
 * Convor widget module — uninstaller.
 *
 * Removes the storefront header event and purges the saved module settings
 * (status / org slug / api base) so a reinstall starts clean. Mirrors
 * Admin\Controller\Module\Convor::uninstall().
 *
 * @var \Opencart\System\Engine\Registry $registry
 */

if (!defined('DIR_APPLICATION')) {
	return;
}

/** @var \Opencart\System\Engine\Registry $registry */

$event_model = $registry->get('model_setting_event');

if ($event_model) {
	$event_model->deleteEventByCode('convor_widget');
}

$setting_model = $registry->get('model_setting_setting');

if ($setting_model) {
	$setting_model->deleteSetting('module_convor_widget');
}
