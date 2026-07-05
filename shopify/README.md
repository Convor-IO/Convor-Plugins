# Convor for Shopify

Embeds the [Convor](https://convor.io) live-chat widget on a Shopify storefront
and gives the merchant a settings screen inside the Shopify admin to wire up
their org.

This is a **Shopify Remix app** plus a **Theme App Extension (App Embed block)**.
The App Embed block replaces the deprecated ScriptTag API — it injects the
external widget loader into the storefront `<body>` via the theme, which is
CSP-clean (no inline JS).

## What this app does

1. **Settings (embedded app)** — the merchant enters their Convor org slug on
   `/app/settings`. It is stored as a **shop metafield**
   (`namespace: convor`, `key: widget`, value: JSON `{ slug, apiBase }`) via
   the Shopify Admin GraphQL `metafieldsSet` mutation.
2. **Widget injection (theme app extension)** — the **Convor** app embed block
   reads the org slug and renders
   `<script src="<apiBase>/widget.js" data-key="<slug>" async></script>` into
   the storefront.

All appearance customization (color, position, greeting) lives server-side in
the Convor dashboard and is fetched at runtime by the widget — the Shopify app
intentionally does **not** duplicate those settings.

## File layout

```
shopify/
├── app/                          # Remix embedded app
│   ├── entry.client.tsx
│   ├── entry.server.tsx
│   ├── root.tsx                  # Polaris AppProvider + ErrorBoundary
│   ├── db.server.ts              # Prisma client (HMR-safe singleton)
│   ├── shopify.server.ts         # authenticate.admin / login / session
│   └── routes/
│       ├── _index.tsx            # → /app
│       ├── app._index.tsx        # /app → /app/settings
│       ├── app.settings.tsx      # the settings form + metafieldsSet
│       ├── auth.login.tsx        # OAuth login form
│       └── auth.$/index.tsx      # OAuth callback catch-all
├── extensions/
│   └── convor-widget/            # Theme App Extension
│       ├── shopify.extension.toml
│       └── blocks/
│           └── convor_widget.liquid   # App Embed block (target: body)
├── prisma/
│   └── schema.prisma             # Session model (shopify-app-session-storage)
├── package.json
├── tsconfig.json
├── vite.config.ts
├── shopify.app.toml              # app metadata, scopes, webhooks
├── shopify.web.toml              # Remix web component config
├── env.d.ts
├── .env.example
└── .npmrc
```

## Prerequisites

- Node `>=20.19 <22 || >=22.12`
- pnpm 9+
- A Shopify Partners account and a dev store
- The Shopify CLI (`pnpm dlx shopify app dev` — no global install needed)

## Setup

```bash
cd shopify
pnpm install

# 1. Link the app to your Partners dashboard + a dev store.
#    This writes shopify/.env with SHOPIFY_API_KEY / SHOPIFY_API_SECRET /
#    SCOPES / SHOPIFY_APP_URL. See .env.example for the raw variables.
pnpm dlx shopify app config link

# 2. Apply the Prisma migration (creates dev.sqlite).
pnpm exec prisma migrate deploy

# 3. Run the app + extension against a tunnelled HTTPS URL.
pnpm dev
#   ↑ equivalent to: pnpm dlx shopify app dev
#     It provisions a Cloudflare Tunnel, sets SHOPIFY_APP_URL, and runs the
#     Remix dev server + the extension in watch mode.
```

`shopify app dev` will print a URL that opens the embedded app inside the
Shopify admin of your dev store. The Theme App Extension is pushed
automatically on first `dev`.

### Manual env (without `shopify app config link`)

Copy `.env.example` → `.env` and fill in:

```
SHOPIFY_API_KEY=...
SHOPIFY_API_SECRET=...
SHOPIFY_APP_URL=https://<your-tunnel>.trycloudflare.com
SCOPES=write_products,write_metafields,read_metafields
```

For local HTTPS without `shopify app dev`, expose the Remix dev server
(default port `3000`) with a tunnel:

```bash
# Cloudflare Tunnel (recommended — what `shopify app dev` uses)
cloudflared tunnel --url http://localhost:3000

# …or ngrok
ngrok http 3000
```

Point `SHOPIFY_APP_URL` at the tunnel URL, then run `pnpm dlx remix vite:dev`.

## Activating the widget on a store

1. Install the app on a dev store (the `pnpm dev` URL does this).
2. Open the Convor app in the admin → enter your **Convor org slug** → Save.
3. Online Store → Themes → Customize → **App embeds** → toggle **Convor** on.
4. Save. The chat bubble now loads from `https://cdn.convor.io/widget.js`.

## Deploying

### Build

```bash
pnpm build        # remix vite:build → ./build
pnpm setup        # prisma generate && prisma migrate deploy
pnpm start        # remix-serve ./build/server/index.js
```

### Hosting (Remix server)

The Remix app is a standard Node server and runs anywhere that supports Node.
Common targets:

- **Fly.io** — `fly launch` (Node Dockerfile), set the env vars as secrets,
  point `SHOPIFY_APP_URL` at the Fly URL.
- **Vercel** — `vercel` (Remix is auto-detected); set env vars in the project
  settings. Use a Postgres Prisma datasource instead of SQLite for
  serverless.
- **Railway / Render** — same pattern.

For production, swap the Prisma datasource in `prisma/schema.prisma` from
SQLite to Postgres and set `DATABASE_URL`.

### Deploying the Theme App Extension

The extension is deployed with the Shopify CLI (it lives in the app bundle,
not the Remix server):

```bash
pnpm dlx shopify app deploy
```

This uploads the `convor-widget` extension to Shopify so merchants can enable
the App Embed block. `shopify.app.toml`'s `[build] include_config_on_deploy`
makes the deploy self-contained.

## How the metafield flows

```
merchant ── /app/settings ──▶ metafieldsSet (shop, convor.widget)
                                      │
              storefront render ──────┤
                                      ▼
            convor_widget.liquid reads shop.metafields.convor.widget
                                      │
                                      ▼
        <script src="https://cdn.convor.io/widget.js" data-key="..." async>
```

The block also exposes an optional per-theme **slug override** setting so a
merchant can run a different Convor org on a staging theme without touching
the metafield.

## Scopes

- `write_products` — required by Shopify to call `metafieldsSet` on shop
  resources.
- `write_metafields` / `read_metafields` — read/write the `convor.widget`
  shop metafield.

No `write_script_tags` — this app does **not** use the (deprecated) ScriptTag
API. Storefront injection is done exclusively via the Theme App Extension.

## License

MIT
