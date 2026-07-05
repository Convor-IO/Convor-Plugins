<?php
namespace Opencart\Admin\Controller\Module;

/**
 * Class Convor
 *
 * Admin configuration controller for the Convor live-chat widget.
 *
 * Implements the standard OpenCart 4 module pattern: a single settings row
 * (code `module_convor_widget`) holding status / org slug / api base, plus
 * the install()/uninstall() hooks the Extensions manager auto-calls to
 * register and tear down the storefront event listener.
 *
 * @package Opencart\Admin\Controller\Module
 */
class Convor extends \Opencart\System\Engine\Controller {
	/**
	 * Default Convor widget CDN base URL (mirrors the catalog controller).
	 */
	private const DEFAULT_API_BASE = 'https://cdn.convor.io';

	/**
	 * Settings code under which all keys are stored in the `setting` table.
	 * Every key is prefixed with this, i.e. `module_convor_widget_status`.
	 */
	private const SETTING_CODE = 'module_convor_widget';

	/**
	 * Permission key used for access/modify checks.
	 */
	private const PERMISSION = 'module/convor';

	/**
	 * Render the configuration form.
	 *
	 * @return void
	 */
	public function index(): void {
		$this->load->language('module/convor');

		$this->document->setTitle($this->language->get('heading_title'));

		$data['breadcrumbs'] = [];
		$data['breadcrumbs'][] = [
			'text' => $this->language->get('text_home'),
			'href' => $this->url->link('common/dashboard', 'user_token=' . $this->session->data['user_token'])
		];
		$data['breadcrumbs'][] = [
			'text' => $this->language->get('text_extension'),
			'href' => $this->url->link('marketplace/extension', 'user_token=' . $this->session->data['user_token'] . '&type=module')
		];
		$data['breadcrumbs'][] = [
			'text' => $this->language->get('heading_title'),
			'href' => $this->url->link('module/convor', 'user_token=' . $this->session->data['user_token'])
		];

		$data['save']   = $this->url->link('module/convor.save', 'user_token=' . $this->session->data['user_token']);
		$data['back']   = $this->url->link('marketplace/extension', 'user_token=' . $this->session->data['user_token'] . '&type=module');
		$data['action'] = $data['save'];

		// Populate field values: submitted POST on validation failure, else stored setting, else default.
		$data['module_convor_widget_status']   = $this->fieldValue('module_convor_widget_status', '0');
		$data['module_convor_widget_org_slug'] = $this->fieldValue('module_convor_widget_org_slug', '');
		$data['module_convor_widget_api_base'] = $this->fieldValue('module_convor_widget_api_base', self::DEFAULT_API_BASE);

		$data['user_token'] = $this->session->data['user_token'];

		$data['header']      = $this->load->controller('common/header');
		$data['column_left'] = $this->load->controller('common/column_left');
		$data['footer']      = $this->load->controller('common/footer');

		$this->response->setOutput($this->load->view('module/convor', $data));
	}

	/**
	 * Persist the form. OpenCart 4 modules save over AJAX and reply with JSON.
	 *
	 * @return void
	 */
	public function save(): void {
		$this->load->language('module/convor');

		$json = [];

		if (!$this->user->hasPermission('modify', self::PERMISSION)) {
			$json['error']['warning'] = $this->language->get('error_permission');
		}

		// Org slug is required only when the module is being enabled.
		$status   = isset($this->request->post['module_convor_widget_status']) ? (string)$this->request->post['module_convor_widget_status'] : '0';
		$org_slug = isset($this->request->post['module_convor_widget_org_slug']) ? trim((string)$this->request->post['module_convor_widget_org_slug']) : '';

		if ($status === '1' && $org_slug === '') {
			$json['error']['org_slug'] = $this->language->get('error_org_slug');
		}

		if (isset($this->request->post['module_convor_widget_org_slug']) && mb_strlen($org_slug) > 128) {
			$json['error']['org_slug'] = $this->language->get('error_org_slug_length');
		}

		if (!$json) {
			$this->load->model('setting/setting');

			$this->model_setting_setting->editSetting(self::SETTING_CODE, $this->request->post);

			$json['success'] = $this->language->get('text_success');
		}

		$this->response->addHeader('Content-Type: application/json');
		$this->response->setOutput(json_encode($json));
	}

	/**
	 * Install hook — auto-called by the Extensions manager when the admin
	 * clicks "Install". Registers the storefront header event. Mirrors the
	 * standalone install.php so the event is set up regardless of how the
	 * module is distributed (manager install vs. manual file copy).
	 *
	 * @return void
	 */
	public function install(): void {
		$this->load->model('setting/event');

		$this->model_setting_event->deleteEventByCode('convor_widget');

		$this->model_setting_event->addEvent([
			'code'        => 'convor_widget',
			'description' => 'Injects the Convor live-chat widget script into the storefront header.',
			'trigger'     => 'catalog/view/common/header/after',
			'action'      => 'module/convor.injectScript',
			'status'      => 1,
			'sort_order'  => 1,
		]);
	}

	/**
	 * Uninstall hook — removes the event and purges the saved settings so a
	 * reinstall starts clean. Mirrors uninstall.php.
	 *
	 * @return void
	 */
	public function uninstall(): void {
		$this->load->model('setting/event');
		$this->model_setting_event->deleteEventByCode('convor_widget');

		$this->load->model('setting/setting');
		$this->model_setting_setting->deleteSetting(self::SETTING_CODE);
	}

	/**
	 * Resolve a field value with the standard OpenCart precedence:
	 * submitted POST → stored setting → supplied default.
	 *
	 * @param string $key     Setting key, e.g. `module_convor_widget_org_slug`.
	 * @param mixed  $default Fallback when neither POST nor config has it.
	 *
	 * @return mixed
	 */
	private function fieldValue(string $key, $default) {
		if (isset($this->request->post[$key])) {
			return $this->request->post[$key];
		}

		$config_value = $this->config->get($key);

		return ($config_value !== null && $config_value !== '') ? $config_value : $default;
	}
}
