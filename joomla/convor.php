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
     * The tag is emitted via `addCustomTag()`. We deliberately avoid the
     * WebAssetManager: on Joomla 4.4+ / 5.x the WAM is locked by the time
     * `onBeforeCompileHead` fires, so `registerScript()`/`useScript()` throw
     * ("WebAssetManager is locked, you came late") and the tag is silently
     * dropped. `addCustomTag()` writes to the document head unconditionally
     * and works regardless of the WAM lock state.
     *
     * The active application is resolved via `Factory::getApplication()` rather
     * than `$this->getApplication()`: when the plugin is loaded through
     * Joomla's legacy filesystem loader (loadPluginFromFilesystem), the
     * CMSPlugin base is not handed an application instance and
     * `$this->getApplication()` returns null. `Factory::getApplication()`
     * always resolves the application for the current request.
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
        $app = Factory::getApplication();

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

        $document->addCustomTag(
            '<script src="' . $escapedUrl . '" data-key="' . $escapedSlug . '" async></script>'
        );
    }
}
