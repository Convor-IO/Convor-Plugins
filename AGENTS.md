# Convor-Plugins — Agent Knowledge Base

This repo holds installable plugins and SDKs that embed the Convor live-chat
widget on third-party platforms. It's composed into `convor-dev` as a
submodule at `plugins/`.

## Architecture

The Convor widget is a `<script>` tag that injects an iframe + chat bubble,
talking to the Convor REST API and Centrifugo WebSocket. The **only** thing
every plugin needs to do is:

1. Inject `<script src="<apiBase>/widget.js" data-key="<org-slug>" async></script>` into the host page.
2. Provide a settings UI where the merchant enters their org slug (and optionally apiBase).

All appearance config (color, position, greeting, etc.) lives server-side in
the Convor dashboard and is fetched at runtime via
`GET /api/widget/config?key=<slug>`. **Plugins must not duplicate appearance
settings** — they create drift.

## Packages

| Path | Stack | Distribution |
|---|---|---|
| `wordpress/` | PHP (WordPress plugin) | WordPress.org Plugin Directory + WooCommerce |
| `shopify/` | Remix + Theme App Extension | Shopify App Store |
| `sdk/` | TypeScript library | npm `@convor/widget-sdk` |
| `sdk-react/` | React component | npm `@convor/widget-react` |

## Conventions

- **Breaking changes are acceptable**: This project is not running in
  production yet. Prefer a clean rewrite or a better design when the code
  benefits from it; do not preserve backward compatibility solely for its own
  sake.
- **Biome** for lint/format on TS packages (mirrors the broader Convor
  conventions: 80-char width, double quotes, 2-space indent, semicolons).
  WordPress PHP follows WordPress coding standards.
- **Conventional Commits** with scope, e.g.
  `feat(shopify): app embed block + settings page`.
- **Git branching**: commit straight to `main` (the default branch). Don't
  create branches unless explicitly asked. Don't open PRs unless asked.
- **No `as any` / `@ts-ignore`** in TS packages.

## Key references (in the SaaS repo)

- Widget embed loader: `saas/apps/widget/src/embed.ts`
- Visitor token endpoint: `POST /api/auth/visitor-token` (accepts `{slug}`)
- Public config endpoint: `GET /api/widget/config?key=<slug>`
- Per-widget allowed-domains: `widget_configs.allowed_domains` (enforced in
  both endpoints above — merchants can restrict where their widget embeds)

## Production endpoints

- Widget script: `https://cdn.convor.io/widget.js` (and `/widget-iframe.html`)
- REST API base: `https://api.convor.io` (or the same host as the dashboard)

> Note: these hostnames are placeholders pending the production CDN launch.
> Plugins read `apiBase` from a constant that can be overridden per-build.
