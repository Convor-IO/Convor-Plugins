# Convor Widget for Magento 2 / Adobe Commerce

Add the [Convor](https://convor.io) live-chat widget to your Magento 2.4+
storefront. Install, enter your organization slug in the admin, and the
widget is live on every page.

The widget is a single script tag:

```html
<script src="https://cdn.convor.io/widget.js" data-key="YOUR_ORG_SLUG" async></script>
```

All appearance customization (color, position, greeting, allowed domains) is
fetched at runtime from the Convor dashboard — the Magento module only
manages the org slug and master switch.

## Requirements

- Magento Open Source or Adobe Commerce **2.4.x** (Magento Framework `>=103.0`)
- PHP **8.1+** (8.1, 8.2, 8.3, 8.4)

## Install

### Via Composer (Adobe Commerce Marketplace)

```bash
composer require convor/widget
bin/magento module:enable Convor_Widget
bin/magento setup:upgrade
bin/magento setup:di:compile      # production only
bin/magento cache:clean
```

### Manual / from source

Copy the contents of this folder into `app/code/Convor/Widget/`, then run the
same `module:enable` / `setup:upgrade` commands above.

## Configure

1. In the admin, go to **Stores → Configuration → Convor → Widget**.
2. Set **Enable Convor Widget** to *Yes*.
3. Enter your **Organization Slug** (found in the Convor dashboard under
   *Settings → Widget*).
4. (Optional) Adjust **Widget Script Base URL** — defaults to
   `https://cdn.convor.io`. Only change this to point at a custom CDN or a
   staging environment.
5. Save and flush the configuration cache.

## How it works

- `view/frontend/layout/default_head_blocks.xml` adds a block to the global
  `<head>` so the widget loads on every storefront page.
- `Block/WidgetScript` reads the system configuration and short-circuits
  rendering when the widget is disabled or no slug is set, so there is zero
  overhead when switched off.
- `etc/csp_whitelist.xml` whitelists `cdn.convor.io` (and related Convor
  hosts) so the external script, iframe, and API calls satisfy Magento's
  default strict Content-Security-Policy.
- All output is escaped via `Magento\Framework\Escaper`.

## Compatibility

The module ships as a Composer package (`convor/widget`,
type `magento2-module`) and is structured for distribution via the
[Adobe Commerce Marketplace](https://commercemarketplace.adobe.com/).

## License

MIT. See [LICENSE](./LICENSE).
