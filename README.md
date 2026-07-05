# Convor Plugins

Installable plugins and SDKs for the [Convor](https://convor.io) live-chat widget.

Each package in this monorepo lets users embed the Convor widget on a specific
platform with minimal setup — install from the marketplace, enter your org
slug, done.

## Packages

| Package | Platform | Distribution | Status |
|---|---|---|---|
| [`wordpress/`](./wordpress) | WordPress.org + WooCommerce | WordPress Plugin Directory | WIP |
| [`shopify/`](./shopify) | Shopify | Shopify App Store | WIP |
| [`sdk/`](./sdk) | Any JS app | npm `@convor/widget-sdk` | WIP |
| [`sdk-react/`](./sdk-react) | React / Next.js | npm `@convor/widget-react` | WIP |

## How the widget embeds

Every plugin injects the same canonical snippet, sourced from the Convor
widget CDN:

```html
<script src="https://cdn.convor.io/widget.js" data-key="YOUR_ORG_SLUG" async></script>
```

`data-key` is your organization's public slug (visible in the dashboard under
Settings → Widget). All appearance customization is fetched at runtime from
the Convor API, so the snippet stays minimal.

## Development

This is a pnpm workspace. Each package has its own build/release process:

```bash
pnpm install
pnpm -r build
```

WordPress and Shopify plugins are PHP/Remix and don't use the pnpm workspace
for their runtime — only the SDK packages do.

## License

MIT
