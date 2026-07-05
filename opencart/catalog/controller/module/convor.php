<?php
namespace Opencart\Catalog\Controller\Module;

/**
 * Class Convor
 *
 * Event-driven storefront integration for the Convor live-chat widget.
 *
 * Registered against the `catalog/view/common/header/after` event in
 * install.php. OpenCart's Loader::view() fires that event with three
 * by-reference arguments after the header template is rendered:
 *
 *     $this->event->trigger('view/' . $route . '/after', [&$route, &$data, &$output]);
 *
 * We append the Convor `<script>` tag to the already-rendered header HTML
 * ($output). Appending to $output directly is preferred over pushing into
 * $data['scripts'] because the header template renders that array as
 * `<script src="{{ script.href }}">` — it can only carry a URL, not the
 * `data-key` / `async` attributes the Convor loader requires.
 *
 * @package Opencart\Catalog\Controller\Module
 */
class Convor extends \Opencart\System\Engine\Controller {
	/**
	 * Default Convor widget CDN base URL.
	 *
	 * Merchants can override this from the admin settings (e.g. to point at
	 * a self-hosted or staging endpoint). No trailing slash.
	 */
	private const DEFAULT_API_BASE = 'https://cdn.convor.io';

	/**
	 * Inject the Convor widget script into the storefront header.
	 *
	 * OpenCart 4 view/.../after event signature. All three parameters are
	 * passed by reference from Event::trigger() via Action::execute() — the
	 * reference is only honoured because we declare `&` here, so it must be
	 * kept.
	 *
	 * @param string $route  Template route, e.g. `common/header`.
	 * @param array  $data   Template data array (unused; output is already rendered).
	 * @param string $output Rendered header HTML. We append the script tag to this.
	 *
	 * @return void
	 */
	public function injectScript(string &$route, array &$data, string &$output): void {
		// All extension settings are hydrated into $this->config by the
		// catalog's startup/setting controller, so no model lookup is needed.
		$status   = (bool)$this->config->get('module_convor_widget_status');
		$org_slug = (string)$this->config->get('module_convor_widget_org_slug');
		$api_base = (string)$this->config->get('module_convor_widget_api_base');

		// Do nothing when disabled or incompletely configured — fail silent
		// so the storefront never breaks because of the widget.
		if (!$status || $org_slug === '') {
			return;
		}

		if ($api_base === '') {
			$api_base = self::DEFAULT_API_BASE;
		}

		// Normalise: strip any trailing slash so we never emit `//widget.js`.
		$api_base = rtrim($api_base, '/');

		// $org_slug is a public slug shown in the merchant dashboard. It is
		// inserted into a URL path and a data attribute, so escape both.
		$slug_url  = rawurlencode($org_slug);
		$slug_attr = htmlspecialchars($org_slug, ENT_QUOTES | ENT_HTML5, 'UTF-8');

		$script_tag = '<script src="' . htmlspecialchars($api_base, ENT_QUOTES | ENT_HTML5, 'UTF-8')
			. '/widget.js" data-key="' . $slug_attr . '" async></script>';

		// Drop the tag right before </head> when present, otherwise append.
		// This keeps the widget in the <head> with the other scripts.
		if ($closing_head_pos = stripos($output, '</head>')) {
			$output = substr_replace($output, "\t" . $script_tag . "\n", $closing_head_pos, 0);
		} else {
			$output .= $script_tag;
		}
	}
}
