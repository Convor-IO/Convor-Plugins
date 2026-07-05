<?php
/**
 * Convor Live Chat — Joomla system plugin.
 *
 * Injects the Convor widget script tag into the site <head> on every
 * front-end page. Appearance (color, position, greeting, allowed domains)
 * is fetched at runtime from the Convor dashboard; this plugin only manages
 * the organization slug, the script base URL, and a master switch.
 *
 * @package     Convor
 * @subpackage  System.Convor
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\Application\CMSApplicationInterface;
use Joomla\CMS\Factory;
use Joomla\CMS\Plugin\CMSPlugin;
use Joomla\CMS\WebAsset\WebAssetManager;

/**
 * System plugin that injects the Convor widget script into the document head.
 *
 * @since  1.0.0
 */
class PlgSystemConvor extends CMSPlugin
{
    /**
     * Default base URL for the Convor widget script.
     *
     * @const string
     * @since 1.0.0
     */
    public const DEFAULT_API_BASE = 'https://cdn.convor.io';

    /**
     * Inject the Convor widget script into the document <head>.
     *
     * Runs on the `onBeforeCompileHead` event. The widget is only injected
     * when:
     *  - the plugin is enabled (the `enabled` param),
     *  - an organization slug is configured, and
     *  - the active application is the site (front-end) — never in the
     *    administrator backend or on document formats other than HTML.
     *
     * The script is registered through the Joomla 5 WebAssetManager so that
     * additional attributes (`data-key`, `async`) are emitted on the tag
     * cleanly and the asset is de-duplicated by the framework. When the
     * asset manager cannot add a remote script, we fall back to
     * `addCustomTag()` so the plugin stays robust across setups.
     *
     * @return  void
     *
     * @since   1.0.0
     */
    public function onBeforeCompileHead(): void
    {
        // Master switch.
        if (!$this->params->get('enabled', 0)) {
            return;
        }

        // Organization slug is required.
        $orgSlug = trim((string) $this->params->get('org_slug', ''));

        if ($orgSlug === '') {
            return;
        }

        // Only inject on the front-end site application and for HTML output.
        try {
            $app = $this->getApplication();
        } catch (\Throwable $e) {
            $app = Factory::getApplication();
        }

        if (!$app instanceof CMSApplicationInterface || !$app->isClient('site')) {
            return;
        }

        $document = $app->getDocument();

        if ($document === null || $document->getType() !== 'html') {
            return;
        }

        // Resolve and sanitize the script base URL.
        $apiBase = trim((string) $this->params->get('api_base', self::DEFAULT_API_BASE));

        if ($apiBase === '') {
            $apiBase = self::DEFAULT_API_BASE;
        }

        $scriptUrl = rtrim($apiBase, '/') . '/widget.js';

        // Verify it is an http(s) URL to avoid malformed input.
        if (
            !filter_var($scriptUrl, \FILTER_VALIDATE_URL)
            || !preg_match('#^https?://#i', $scriptUrl)
        ) {
            return;
        }

        // Escape values that land in the rendered HTML.
        $escapedUrl  = htmlspecialchars($scriptUrl, \ENT_QUOTES, 'UTF-8');
        $escapedSlug = htmlspecialchars($orgSlug, \ENT_QUOTES, 'UTF-8');

        $webAsset = $document->getWebAssetManager();

        if ($webAsset instanceof WebAssetManager) {
            // Register a one-off asset so we can attach custom attributes
            // (data-key + async) and let the framework de-duplicate it.
            try {
                $webAsset->registerScript(
                    'plg_system_convor.widget',
                    $scriptUrl,
                    [],
                    ['defer' => false, 'async' => true, 'data-key' => $orgSlug],
                );
                $webAsset->useScript('plg_system_convor.widget');

                return;
            } catch (\Throwable $e) {
                // Fall through to the addCustomTag() fallback below.
            }
        }

        // Fallback: emit the raw tag via addCustomTag().
        $document->addCustomTag(
            '<script src="' . $escapedUrl . '" data-key="' . $escapedSlug . '" async></script>'
        );
    }
}
