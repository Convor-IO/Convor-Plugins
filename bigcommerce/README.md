# Convor for BigCommerce

Embeds the [Convor](https://convor.io) live-chat widget on a BigCommerce
storefront and gives the merchant a settings screen inside the BigCommerce
control panel to wire up their org.

This is a **single-click app**: a small Fastify server that handles
BigCommerce OAuth, verifies the load-callback `signed_payload`, stores the
merchant's org slug as a store metafield, and injects the widget loader via
the **Scripts API** (`POST /stores/{hash}/v3/scripts`) — BigCommerce's
cleanest, non-deprecated, channel-aware storefront-script mechanism.

## What this app does

1. **Settings (embedded iframe)** — the merchant enters their Convor org slug
   on `/load`. It is stored as a **store metafield** (`namespace: convor`,
   `key: widget`, value: JSON `{ slug, apiBase }`) via
   `PUT/POST /stores/{hash}/v3/metafields`.
2. **Widget injection (Scripts API)** — on demand (and idempotently), the app
   registers a script that renders
   `<script src="<apiBase>/widget.js" data-key="<slug>" async></script>` into
   the storefront `<head>`.

All appearance customization (color, position, greeting) lives server-side in
the Convor dashboard and is fetched at runtime by the widget — the BigCommerce
app intentionally does **not** duplicate those settings.

## File layout

```
bigcommerce/
├── src/
│   ├── index.ts             # Fastify routes: / /auth /load /uninstall + /api/*
│   ├── config.ts            # typed env loader
│   ├── oauth.ts             # install URL + code-for-token exchange
│   ├── signed-payload.ts    # verify BC load-callback JWT (HS256)
│   ├── session.ts           # HttpOnly session cookie (HS256)
│   ├── bigcommerce-client.ts# typed REST client (metafields + scripts)
│   ├── widget-config.ts     # config types, validation, snippet builder
│   ├── token-store.ts       # JSON-file OAuth-token store (sample)
│   ├── views.ts             # landing + settings + error HTML
│   └── html.ts              # escaping + minimal page shell + styles
├── package.json
├── tsconfig.json
├── config.json              # Developer Portal manifest template
├── env.example
└── README.md
```

## How it renders

```
merchant ──/──▶ "Install" ──▶ BigCommerce OAuth
                                   │
            /auth ◀── code ────────┘
              │  exchange → access_token (stored)
              │  set session cookie
              ▼
            /load?signed_payload=…  ── verify JWT (HS256, client_secret)
              │  refresh session cookie
              ▼
            /load/{hash}  ──▶ settings page (pre-loaded metafield + script status)

settings page ──POST /api/settings──────────▶ upsert store metafield
              ──POST /api/install-script─────▶ POST /v3/scripts (Scripts API)
              ──POST /api/uninstall-script───▶ DELETE /v3/scripts/{uuid}
```

## Prerequisites

- Node `>=20.11`
- A BigCommerce [Developer Portal](https://devtools.bigcommerce.com) app
- A dev/sandbox store to install against
- A public HTTPS URL for the app (Cloudflare Tunnel or ngrok in dev)

## Setup

```bash
cd bigcommerce
pnpm install        # or npm install / yarn

cp env.example .env
# fill in BC_CLIENT_ID, BC_CLIENT_SECRET, APP_BASE_URL
```

In the Developer Portal (**My Apps → your app → Edit**):

- **Auth Callback URL**: `https://<APP_BASE_URL>/auth`
- **Load Callback URL**: `https://<APP_BASE_URL>/load`
- **Uninstall Callback URL**: `https://<APP_BASE_URL>/uninstall`
- **OAuth Scopes**: `Content` (read/write) — covers Scripts API + metafields.

### Tunnel for local development

```bash
# Cloudflare Tunnel (free, no account)
cloudflared tunnel --url http://localhost:3000

# …or ngrok
ngrok http 3000
```

Set `APP_BASE_URL` to the tunnel URL, then:

```bash
pnpm dev            # tsx watch src/index.ts
```

Open `https://<APP_BASE_URL>/` in a browser, click **Install on BigCommerce**,
approve the scopes on your dev store, and you'll land in the embedded settings
screen.

## The Scripts API call

`POST https://api.bigcommerce.com/stores/{store_hash}/v3/scripts` with
`X-Auth-Client` + `X-Auth-Token` headers and body:

```json
{
  "name": "Convor Widget",
  "description": "Loads the Convor live-chat widget. Installed by the Convor app.",
  "html": "<script src=\"https://cdn.convor.io/widget.js\" data-key=\"acme-store\" async></script>",
  "location": "head",
  "load_method": "default",
  "visibility": "storefront",
  "channel_id": null,
  "auto_uninstall": true
}
```

`visibility: "storefront"` targets all storefront pages across channels;
`channel_id: null` applies it store-wide. `auto_uninstall: true` makes
BigCommerce remove the script automatically if the app is uninstalled, so the
storefront stays clean.

## Storage

- **OAuth access tokens** — `data/tokens.json` (one JSON object per line, keyed
  by store hash). This is a **sample** store; it is single-instance and has no
  locking. **For production, swap `FileTokenStore` for a Postgres/Redis-backed
  implementation** before listing on the marketplace.
- **Widget config** — store metafield `convor.widget` (JSON), owned by the
  store.
- **Session** — short-lived (8h) HS256 JWT in an `HttpOnly; Secure;
  SameSite=None` cookie (the app runs inside a cross-origin BC iframe).

## Scopes

Only `Content` (read/write) is requested — it covers both the Scripts API and
store metafields. No checkout/customer scopes. Over-scoping is rejected at UAT.

## Marketplace submission (UAT checklist)

1. **Functional** — install on a fresh sandbox store, save a slug, inject the
   script, confirm the chat bubble renders on the storefront, then uninstall
   and confirm the script is removed (`auto_uninstall` + manual DELETE).
2. **Privacy/permissions** — request the minimum scope (Content only); document
   why in the listing.
3. **Uninstall** — `/uninstall` cleans up the script and removes the stored
   token. Implement HMAC webhook verification before submitting (the sample
   stub trusts the bearer header only).
4. **HTTPS everywhere** — app URL must be HTTPS; cookies are `Secure`.
5. **Branding** — `config.json` icon/marketing assets uploaded to the Developer
   Portal.

## Deploying

The app is a standard Node server and runs anywhere that supports Node.

```bash
pnpm build         # tsc → dist/
pnpm start         # node dist/index.js
```

Common targets:

- **Fly.io / Railway / Render** — Node Dockerfile, set env vars as secrets,
  point `APP_BASE_URL` at the deployed URL.
- **AWS (Lambda + API Gateway / ALB)** — package `dist/` + `node_modules`; keep
  `data/tokens.json` on EFS or move to DynamoDB.

For production, replace the file token store with a real database and add
webhook HMAC verification to `/uninstall`.

## License

MIT
