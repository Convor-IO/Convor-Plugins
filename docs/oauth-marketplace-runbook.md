# OAuth & marketplace submission runbook

> **For the operator (human or assistant):** This is the step-by-step to take
> the three hosted-platform apps (`shopify/`, `bigcommerce/`, `ecwid/`) from
> "boots locally" to "installed from the real marketplace against a real
> store." Each app's code is complete; this runbook covers the parts that
> need real accounts, real HTTPS endpoints, and real platform review.
>
> Before starting any platform: stand up the **public HTTPS endpoint** (step 0).

---

## Step 0 — Public HTTPS endpoint (do this once)

Every platform needs the app reachable at a public HTTPS URL. Cheapest path:

### Option A: Cloudflare Tunnel (recommended, free)
```bash
# Install once
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared

# Start a tunnel to the local app port. Gives you a stable
# https://<random>.trycloudflare.com URL.
cloudflared tunnel --url http://localhost:3000
```
Note the URL — it's used as `application_url` / callback URL in every platform below. The free `trycloudflare.com` URLs rotate on restart; for stable subdomains, create a named tunnel pointing a `convor-shopify.convor.io` DNS record at it (free with a Cloudflare-hosted zone).

### Option B: ngrok
```bash
ngrok http 3000   # → https://<random>.ngrok.io
```
Free tier gives random URLs; paid ($8/mo) for stable subdomains.

### Run the three apps
Each app has its own port to avoid conflicts:
```bash
# Shopify (Remix, port 3000)
cd plugins/shopify && pnpm install && pnpm dev

# BigCommerce (Fastify, port 3000 — run separately or change PORT)
cd plugins/bigcommerce && npm install && npm run dev

# Ecwid (Fastify, port 3000 — run separately or change PORT)
cd plugins/ecwid && npm install && npm run dev
```
Point the tunnel at whichever you're testing.

---

## Shopify

### Account setup
1. **Partner account** (free, no card): https://partners.shopify.com/signup
2. **Create app**: Partners dashboard → **Apps** → **Create app** → "Custom" (for testing) or "Public" (for the App Store).
   - App name: `Convor Live Chat`
   - App URL: `https://<tunnel-url>` (from step 0)
   - Allowed redirection URI(s):
     - `https://<tunnel-url>/auth/callback`
     - `https://<tunnel-url>/auth/callback/inline`
     - `https://<tunnel-url>/auth/login`
3. **Get credentials**: app settings → **API credentials** → copy **Client ID** (= API key) and **Client secret**.
4. **Create a dev store**: Partners → **Stores** → **Add store** → **Development store**. Free, unlimited, no checkout but full admin + storefront. Note the `*.myshopify.com` domain.

### Configure the app locally
```bash
cd plugins/shopify
cp .env.example .env
```
Fill in:
```
SHOPIFY_API_KEY=<Client ID from step 3>
SHOPIFY_API_SECRET=<Client secret from step 3>
SHOPIFY_APP_URL=https://<tunnel-url>
SCOPES=write_products,write_metafields,read_metafields
```
Update `shopify/shopify.app.toml`:
- `client_id = "<Client ID>"`
- `[auth] redirect_urls` → replace `CONVOR_APP_URL` with the tunnel URL.

### Verify OAuth end-to-end
1. Start the Remix app: `pnpm dev` (it provisions its own tunnel if you don't have one; either way, ensure `SHOPIFY_APP_URL` matches the public URL).
2. From the dev store admin: `https://<store>.myshopify.com/admin/apps/<client-id>` — this triggers the OAuth install flow.
3. Approve the scopes. You should land on the embedded settings page (App Bridge iframe) at `/app/settings`.
4. Enter the Convor org slug (e.g. `test-org` if testing against local SaaS, or a real slug), save.
5. Verify the metafield was written: Partners → your store → admin → Apps → Convor → the slug persists across reloads. Or via GraphQL: `query { shop { metafield(namespace: "convor", key: "widget") { value } } }`.
6. **Enable the App Embed**: store admin → **Online Store** → **Themes** → **Customize** → **App embeds** → toggle **Convor** on → Save.
7. Visit the storefront: `https://<store>.myshopify.com/`. The widget snippet should be in the page HTML, the launcher visible.

### Submit to the App Store
1. Partners → **Apps** → your app → **Distribution** → **Create store listing**.
2. Required assets:
   - **App icon** (512×512 PNG, transparent background).
   - **App banner** (1280×720).
   - **Screenshots** (at least 2, 1280×800): the settings page + the widget on a storefront.
   - **Pricing**: Free.
   - **Privacy policy URL** (host one on `convor.io/privacy`).
   - **Support URL** (`convor.io/support` or `mailto:support@convor.io`).
3. Submit. **Review: ~5–10 business days.** Common rejection reasons: missing uninstall handling (we have it), over-broad scopes (we request the minimum), App Embed block not auto-enabling on install (it's not — merchants toggle it manually; that's normal but document it clearly in the listing).

---

## BigCommerce

### Account setup
1. **Developer account** (free): https://devtools.bigcommerce.com/sign-up
2. **Create app**: Developer Portal → **My Apps** → **Create an app**.
   - App name: `Convor Live Chat`
   - **Auth Callback URL**: `https://<tunnel-url>/auth`
   - **Load URL**: `https://<tunnel-url>/load`
   - **Uninstall URL**: `https://<tunnel-url>/uninstall`
   - Leave "Multi-storefront compatible" checked (Convor supports it — Scripts API `channel_id: null` = all channels).
3. **Get credentials**: app details → **Client ID** and **Client Secret**.
4. **Create a test store**: sign up for a free 15-day trial at bigcommerce.com (no card needed for trial). Note the store URL + the `store_hash` (in the store admin URL: `https://store-<hash>.mybigcommerce.com/manage`).

### Configure the app locally
```bash
cd plugins/bigcommerce
cp env.example .env
```
Fill in:
```
BC_CLIENT_ID=<Client ID>
BC_CLIENT_SECRET=<Client Secret>
APP_BASE_URL=https://<tunnel-url>
PORT=3000
```

### Verify OAuth end-to-end
1. Start the app: `npm run dev`.
2. From the trial store admin: **Apps** → **My Apps** → find your draft app (under "My Draft Apps" if it's not yet published) → **Install**.
3. BigCommerce POSTs a one-time `code` to your `/auth` callback. Your `oauth.ts` exchanges it for an access token and stores `{store_hash, access_token}` (currently in a JSON file via `token-store.ts` — swap for Postgres before production).
4. BigCommerce then loads `/load` with a `signed_payload` JWT in the URL. Your `signed-payload.ts` verifies it (HS256 with client secret) and renders the settings iframe.
5. Enter the Convor org slug, save → `POST /api/settings` writes the metafield `convor.widget = {slug, apiBase}`.
6. Click **Inject widget** → `POST /api/install-script` registers the widget via the Scripts API (`POST /stores/{hash}/v3/scripts` with `visibility: storefront`).
7. Visit the storefront: `https://<store>.mybigcommerce.com/`. The widget snippet should be in `<head>`, the launcher visible.

### Known gaps to fix before submission
- **Token persistence**: `token-store.ts` is a JSON-file stub. Replace with Postgres/Redis (the SaaS stack already has both). Without persistent storage, an app restart loses all store tokens → broken installs.
- **Uninstall HMAC**: `/uninstall` currently trusts the bearer header. Add HMAC verification (BigCommerce signs uninstall webhooks with the client secret) before the marketplace submission, or the review will flag it.

### Submit to the marketplace
1. Developer Portal → your app → **Submit for UAT** (User Acceptance Testing).
2. Required: app description, screenshots, pricing (Free), support email, privacy policy.
3. **Review: 2 weeks to 2 months** (community-reported; BigCommerce doesn't publish SLAs). They manually test the install + uninstall flow. The slow path is the main reason to submit BigCommerce early.

---

## Ecwid

### Account setup
1. **Developer account** (free): https://developers.ecwid.com/ → **Register**.
2. **Create app**: developer portal → **My Apps** → **Create**.
   - App name: `Convor Live Chat`
   - **Redirect URI**: `https://<tunnel-url>/install`
   - Scopes: `customize_storefront` (required for the storefront script), `read_store_profile`, `read_catalog`.
3. **Get credentials**: you'll receive **Client ID**, **Client Secret**, and an **App ID** (numeric, used by the storefront loader).
4. **THE ECWID-SPECIFIC STEP — register the storefront script**: Ecwid has no `/scripts` API endpoint. You must register a **single** HTTPS JS URL with Ecwid support that they will auto-load on every storefront page for stores with your app installed.
   - Email `developers@ecwid.com` (or use the developer portal's support form) with:
     - Your App ID.
     - The URL: `https://<production-domain>/storefront.js` (must be HTTPS, must be the production domain — not the tunnel, since it's permanent).
     - Request the `customize_storefront` scope be enabled.
   - **This takes 1–3 business days** and is the slowest part of the Ecwid setup. Start it as soon as you have a production domain.

### Configure the app locally
```bash
cd plugins/ecwid
cp env.example .env
```
Fill in:
```
ECWID_CLIENT_ID=<Client ID>
ECWID_CLIENT_SECRET=<Client Secret>
ECWID_REDIRECT_URL=https://<tunnel-url>/install
ECWID_APP_ID=<numeric App ID>
CONVOR_DEFAULT_API_BASE=https://cdn.convor.io   # or your local proxy for testing
```

### Verify OAuth end-to-end
1. Start the app: `npm run dev`.
2. From an Ecwid store (free plan works): visit the install URL:
   `https://my.ecwid.com/api/oauth/authorize?client_id=<ID>&redirect_uri=https://<tunnel-url>/install&scope=customize_storefront,read_store_profile,read_catalog&response_type=code`
3. Ecwid redirects to your `/install` with a `code`. Your `oauth.ts` exchanges it at `https://my.ecwid.com/api/v3/token` and stores `{storeId, token}`.
4. Open the app iframe: the store admin loads `https://<tunnel-url>/app?storeId=<id>`. Enter the slug, save → `PUT https://app.ecwid.com/api/v3/{storeId}/storage/public` with `{slug, apiBase, appId}`.
5. The storefront loader (`public/storefront.js`, which you registered with Ecwid support) reads `Ecwid.getAppPublicConfig(appId)` on every storefront page and injects the widget script.
6. Visit the storefront: the widget launcher should appear.

### Caveat
You can't fully verify locally until Ecwid support registers your storefront script URL (step 4 of account setup). Until then, `storefront.js` isn't loaded by Ecwid's storefront. You can still test the OAuth + settings flow (steps 1–4) and verify `storefront.js` works in isolation by loading it manually in a browser with a stubbed `Ecwid.getAppPublicConfig`.

### Submit to the marketplace
1. Developer portal → your app → **Submit for review**.
2. Required: app description, screenshots, pricing (Free), support email, privacy policy, the registered storefront script URL.
3. **Review: ~1–2 weeks.** They verify the storefront script loads and the app installs cleanly.

---

## Summary checklist

| Platform | Sign up | Create app | Get credentials | Special step | Test install | Submit | Review time |
|---|---|---|---|---|---|---|---|
| **Shopify** | partners.shopify.com | Partners → Apps → Create | Client ID + Secret (app settings) | Dev store | OAuth → App Embed toggle → storefront | Partners → Distribution | 5–10 days |
| **BigCommerce** | devtools.bigcommerce.com | Dev Portal → My Apps → Create | Client ID + Secret (app details) | Trial store | OAuth → settings → Inject script | Dev Portal → Submit for UAT | **2–6 weeks** |
| **Ecwid** | developers.ecwid.com | Dev portal → My Apps → Create | Client ID + Secret + App ID | **Email support to register storefront script URL (1–3 days)** | OAuth → settings → storefront | Dev portal → Submit | 1–2 weeks |

## Code-level gaps to close before submission (across all three)

These are flagged in each app's README but worth re-stating:

1. **Persistent token storage** — Shopify uses Prisma (production-ready), BigCommerce and Ecwid use JSON-file stubs. Swap the stubs for Postgres before submission, or restarts will break installs.
2. **Uninstall webhook verification** — all three platforms send uninstall webhooks; verify the signature (HMAC for BC/Ecwid, HMAC-SHA256 for Shopify) before acting. The Shopify app handles this; BC and Ecwid need it added.
3. **Privacy policy + support URL** — host both on `convor.io` before creating any listing.
4. **App icons + screenshots** — 512×512 icon, 1280×720 banner, 2+ screenshots per platform.

## What "done" looks like

For each platform, the end-to-end proof is:
1. Install the app from the marketplace on a fresh store.
2. Enter the Convor org slug in the settings page.
3. Visit the storefront — the widget launcher is visible.
4. Open the bubble — a conversation is created in the Convor dashboard for that org.

Until all four hold, the integration isn't shipped. The code is ready; this runbook gets you through the operational steps that need real accounts.
