# Convor Live Chat for WordPress

Add the [Convor](https://convor.io) live-chat widget to your WordPress site —
or WooCommerce store — in under a minute. Install, paste your org slug, done.

[![WordPress Plugin Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](./convor.php)
[![Requires PHP](https://img.shields.io/badge/PHP-%3E%3D%208.0-777bb4.svg)](./convor.php)
[![License](https://img.shields.io/badge/license-GPL--2.0--or--later-green.svg)](./LICENSE)

## What it does

Convor is a multi-tenant live-chat SaaS. The widget is a single `<script>`
tag that injects a chat bubble + iframe, with all appearance config fetched at
runtime from the Convor API. This plugin:

1. Injects the canonical widget snippet into `wp_footer` on every public page.
2. Adds a **Settings → Convor** page where you enter your Organization Slug
   (and optionally a CDN base URL).
3. **WooCommerce aware** — on product pages it pushes product, price, currency
   and cart context to the visitor SDK.

## Installation

### From the WordPress Plugin Directory

1. **Plugins → Add New** → search **Convor Live Chat** → **Install Now** → **Activate**.
2. Go to **Settings → Convor**, paste your Organization Slug, save.

### Manual

1. Copy this folder to `wp-content/plugins/convor/`.
2. Activate **Convor Live Chat** from the Plugins screen.
3. **Settings → Convor** → enter your slug.

## Where do I find my Organization Slug?

In the [Convor dashboard](https://convor.io): **Settings → Widget**. It looks
like `my-company`.

## The embed snippet

The plugin injects exactly this into your footer (no appearance config — that
lives in the dashboard):

```html
<!-- Convor Live Chat -->
<script src="https://cdn.convor.io/widget.js" data-key="YOUR_ORG_SLUG" async></script>
```

## WooCommerce integration

On single product pages, the plugin pushes context so agents can see what the
visitor is looking at:

```js
window.Convor.setAttributes({
  productId:    42,
  productName:  "Convor Hoodie",
  productPrice: "39.00",
  currency:     "USD",
  cartTotal:    "78.00",
  viewing:      "product",
});
```

If the SDK hasn't loaded yet, attributes are queued in `window.__convorQueue`.

## Developer hooks

| Filter | Purpose |
| --- | --- |
| `convor_widget_config` | Override the `{ key, apiBase }` used for the embed. |
| `convor_woocommerce_attributes` | Override/extend the attributes pushed on product pages. |
| `convor_disable_widget` | Return `true` to suppress the widget (e.g. for consent plugins). |

### Example: force a slug from code

```php
add_filter( 'convor_widget_config', function ( $config ) {
	$config['key'] = 'my-company';
	return $config;
} );
```

## File structure

```
wordpress/
├── convor.php                          # Main plugin file + header
├── uninstall.php                       # Cleans options on deletion
├── readme.txt                          # WordPress.org readme
├── README.md                           # This file (GitHub)
├── languages/
│   └── convor.pot                      # Translation template
├── includes/
│   ├── class-convor-settings.php       # Settings → Convor page (Settings API)
│   ├── class-convor-embed.php          # wp_footer script tag + filters
│   └── class-convor-woocommerce.php    # WooCommerce product context
└── assets/
    ├── css/admin.css                   # Settings page styling
    └── js/admin.js                     # Light UX helpers
```

## Requirements

- WordPress 6.0+
- PHP 8.0+
- WooCommerce (optional) for product-context integration

## Coding standards

PHP follows WordPress Coding Standards (single quotes, `convor_` prefixing,
`esc_*` output escaping, nonces, capability checks). Front-end JS follows the
repo's Biome config (2-space indent, double quotes, semicolons).

## License

GPL-2.0-or-later. See the plugin header and the repository's [LICENSE](../LICENSE).
