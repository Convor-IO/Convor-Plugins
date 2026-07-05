<?php
/**
 * Convor_Widget block — renders the widget <script> tag.
 *
 * Reads the module's system configuration (enabled flag, org slug, API base)
 * and exposes the escaped values to the widget_script.phtml template.
 *
 * @package Convor_Widget
 */

declare(strict_types=1);

namespace Convor\Widget\Block;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Escaper;
use Magento\Framework\View\Element\Template;
use Magento\Framework\View\Element\Template\Context;
use Magento\Store\Model\ScopeInterface;

/**
 * Block backing the storefront widget <script> tag.
 */
class WidgetScript extends Template
{
    /**
     * System config path for the enable flag.
     */
    public const XML_PATH_ENABLED = 'convor_widget/general/enabled';

    /**
     * System config path for the organization slug.
     */
    public const XML_PATH_ORG_SLUG = 'convor_widget/general/org_slug';

    /**
     * System config path for the widget script base URL.
     */
    public const XML_PATH_API_BASE = 'convor_widget/general/api_base';

    /**
     * Default API base used when no value is configured.
     */
    public const DEFAULT_API_BASE = 'https://cdn.convor.io';

    /**
     * @var ScopeConfigInterface
     */
    private ScopeConfigInterface $scopeConfig;

    /**
     * @var Escaper
     */
    private Escaper $escaper;

    /**
     * @param Context $context
     * @param array<int,mixed> $data
     */
    public function __construct(
        Context $context,
        array $data = []
    ) {
        parent::__construct($context, $data);
        $this->scopeConfig = $context->getScopeConfig();
        $this->escaper = $context->getEscaper();
    }

    /**
     * Whether the widget should be rendered.
     *
     * Returns true only when the master switch is on AND an org slug is set.
     *
     * @return bool
     */
    public function isEnabled(): bool
    {
        $enabled = $this->scopeConfig->isSetFlag(
            self::XML_PATH_ENABLED,
            ScopeInterface::SCOPE_STORE
        );

        return $enabled && $this->getOrgSlug() !== '';
    }

    /**
     * The organization slug (public key), or empty string.
     *
     * @return string
     */
    public function getOrgSlug(): string
    {
        return (string) $this->scopeConfig->getValue(
            self::XML_PATH_ORG_SLUG,
            ScopeInterface::SCOPE_STORE
        );
    }

    /**
     * The widget script base URL, normalized without a trailing slash.
     *
     * @return string
     */
    public function getApiBase(): string
    {
        $base = (string) $this->scopeConfig->getValue(
            self::XML_PATH_API_BASE,
            ScopeInterface::SCOPE_STORE
        );

        if ($base === '') {
            $base = self::DEFAULT_API_BASE;
        }

        return rtrim($base, '/');
    }

    /**
     * The fully-qualified widget script URL (api base + /widget.js).
     *
     * @return string
     */
    public function getScriptUrl(): string
    {
        return $this->getApiBase() . '/widget.js';
    }

    /**
     * The org slug escaped for use as an HTML attribute value.
     *
     * @return string
     */
    public function getEscapedOrgSlug(): string
    {
        return $this->escaper->escapeHtmlAttr($this->getOrgSlug());
    }

    /**
     * The widget script URL escaped for use in an href/src attribute.
     *
     * @return string
     */
    public function getEscapedScriptUrl(): string
    {
        return $this->escaper->escapeUrl($this->getScriptUrl());
    }

    /**
     * Skip rendering when the widget is disabled.
     *
     * @return string
     */
    protected function _toHtml(): string
    {
        if (!$this->isEnabled()) {
            return '';
        }

        return parent::_toHtml();
    }
}
