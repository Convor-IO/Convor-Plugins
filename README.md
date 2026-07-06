# Convor Plugins

Installable plugins and SDKs for the [Convor](https://convor.io) live-chat widget.

Each package lets users embed the Convor widget on a specific platform with
minimal setup — install from the marketplace (or paste the snippet), enter
your org slug, and you're live.

## Packages

### Tier A — Hosted e-commerce marketplaces (auto-install)

| Package | Platform | Distribution |
|---|---|---|
| [`shopify/`](./shopify) | Shopify | Shopify App Store (Theme App Extension → App Embed block) |
| [`wordpress/`](./wordpress) | WordPress.org + WooCommerce | WordPress Plugin Directory (+ Woo Marketplace) |
| [`bigcommerce/`](./bigcommerce) | BigCommerce | BigCommerce Marketplace (Scripts API + embedded app) |
| [`wix/`](./wix) | Wix | Wix App Market (Embedded Script extension) |
| [`ecwid/`](./ecwid) | Ecwid | Ecwid App Market (storefront script + embedded app) |
| [`magento/`](./magento) | Magento / Adobe Commerce | Adobe Commerce Marketplace (module + CSP whitelist) |
| [`prestashop/`](./prestashop) | PrestaShop | PrestaShop Addons (`displayHeader` hook module) |
| [`opencart/`](./opencart) | OpenCart | OpenCart Marketplace (header event listener) |

### Tier B — CMS marketplaces

| Package | Platform | Distribution |
|---|---|---|
| [`drupal/`](./drupal) | Drupal 11 | drupal.org project (`hook_page_attachments` module) |
| [`joomla/`](./joomla) | Joomla 5 | JED (system plugin → `onBeforeCompileHead`) |

### Tier C — Website builders (snippet-paste guides)

| Package | Platform | Distribution |
|---|---|---|
| [`builders/webflow/`](./builders/webflow) | Webflow | Custom Code guide |
| [`builders/framer/`](./builders/framer) | Framer | Custom Code guide |
| [`builders/squarespace/`](./builders/squarespace) | Squarespace | Code Injection guide |
| [`builders/duda/`](./builders/duda) | Duda | Custom Code guide |

### Tier D — Developer SDKs & adjacent surfaces

| Package | Platform | Distribution |
|---|---|---|
| [`packages/widget-sdk/`](./packages/widget-sdk) | Any JS app | npm `@convor/widget-sdk` (framework-agnostic) |
| [`packages/widget-react/`](./packages/widget-react) | React / Next.js | npm `@convor/widget-react` |
| [`browser-extension/`](./browser-extension) | Chrome + Firefox | Chrome Web Store + AMO (MV3 extension) |
| [`gtm/`](./gtm) | Google Tag Manager | GTM Custom Template |
| [`segment/`](./segment) | Segment analytics.js | npm `@convor/segment-bridge` |

## How the widget embeds

Every package injects the same canonical snippet, sourced from the Convor
widget CDN:

```html
<script src="https://cdn.convor.io/widget.js" data-key="YOUR_ORG_SLUG" async></script>
```

`data-key` is your organization's public slug (visible in the dashboard under
Settings → Widget). All appearance customization is fetched at runtime from
the Convor API (`GET /api/widget/config?key=<slug>`), so the snippet stays
minimal — plugins must not duplicate appearance settings.

## Development

This is a pnpm workspace. The TypeScript packages install and build together:

```bash
pnpm install
pnpm -r build          # widget-sdk + widget-react + segment
pnpm -r test           # 43 tests across the TS packages
```

The PHP plugins (`wordpress/`, `magento/`, `prestashop/`, `opencart/`,
`drupal/`, `joomla/`) don't use the pnpm workspace for their runtime. The
Remix/Node apps (`shopify/`, `bigcommerce/`, `ecwid/`) each have their own
`package.json`. The browser extension has its own build (`cd browser-extension
&& pnpm install --ignore-workspace && pnpm build`).

## Per-widget allowed origins

Each Convor org can restrict where its widget embeds via the dashboard
(Settings → Widget → Allowed Domains). When set, the Convor API rejects
`GET /api/widget/config` and `POST /api/auth/visitor-token` requests whose
`Origin`/`Referer` host isn't in the list. Plugins are unaffected by this
(the host site's domain is automatically the request origin), but merchants
should add their storefront domain to the allowlist before going live.

## License

MIT
