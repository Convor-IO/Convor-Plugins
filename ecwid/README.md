# Convor for Ecwid

Embeds the Convor live-chat widget on an Ecwid storefront via the Ecwid
**storefront customization** mechanism, with a settings form embedded in the
Ecwid Control Panel.

Convor is a multi-tenant live-chat SaaS. The widget is a single script tag:

```html
<script src="<apiBase>/widget.js" data-key="<org-slug>" async></script>
```

All appearance config (colors, position, greeting) lives server-side in the
Convor dashboard and is fetched at runtime — this plugin only collects the
**organization slug** and optional API base.

---

## How storefront injection works in Ecwid

Ecwid does **not** expose a per-store `POST /api/v3/{storeId}/scripts`
endpoint. Instead, storefront customization is a two-part mechanism:

1. **One registered loader file.** You register a single HTTPS `.js` URL with
   Ecwid (via the developer program / Ecwid support). Ecwid then auto-loads
   that file on **every** storefront page for every store that has the app
   installed. This requires the `customize_storefront` scope.
   - Reference: <https://developers.ecwid.com/api-documentation/customize-behaviour#how-to-load-custom-javascript-anytime-storefront-is-loaded>
   - In this app the loader is `public/storefront.js`, served at
     `https://<your-host>/storefront.js`.

2. **Per-store public config.** The loader reads store-specific settings via
   `Ecwid.getAppPublicConfig(appId)`. That value is the `public` key in the
   app's storage, written through the REST API:

   ```
   PUT https://app.ecwid.com/api/v3/{storeId}/storage/public?token={token}
   Content-Type: application/json;charset=utf-8

   {"slug":"your-org","apiBase":"https://cdn.convor.io","appId":"..."}
   ```

   Reference: <https://developers.ecwid.com/api-documentation/benefits-of-application-storage>

The loader parses that JSON and injects the Convor `<script>` tag with the
store's `slug` and `apiBase`. There is no appearance config here — that stays
in Convor.

---

## Architecture

```
ecwid/
├── app.json                  # Reference of values to register with Ecwid
├── env.example               # Required environment variables
├── package.json
├── tsconfig.json
├── biome.json
├── public/
│   └── storefront.js         # Loader Ecwid injects on storefront pages
├── views/
│   ├── install.html          # GET /  — install landing page (OAuth link)
│   └── app.html              # GET /app — embedded settings form
└── src/
    ├── config.ts             # Env parsing + scopes + host constants
    ├── store.ts              # File-backed install/settings persistence
    ├── ecwid-client.ts       # Typed Ecwid REST client (Bearer auth)
    ├── oauth.ts              # authorize URL + token exchange
    ├── html.ts               # HTML/JS string escaping
    └── index.ts              # Fastify server + routes
```

### Routes

| Method | Path             | Purpose                                                            |
| ------ | ---------------- | ----------------------------------------------------------------- |
| GET    | `/`              | Install landing page → Ecwid OAuth authorize URL.                 |
| GET    | `/install`       | OAuth callback; exchanges `code` for token, stores install.       |
| GET    | `/app`           | Embedded settings form (rendered in the Ecwid Control Panel iframe). |
| POST   | `/api/settings`  | Validates + saves `{slug, apiBase}`, publishes public config.     |
| DELETE | `/api/uninstall` | Clears public config, removes local install record.               |
| GET    | `/storefront.js` | Serves the storefront loader (appId baked in).                    |
| GET    | `/health`        | Health check.                                                     |

### Storage

OAuth tokens and per-store settings are persisted as one JSON file per store
in `./data/<storeId>.json`. Ecwid access tokens do not expire, so this is
sufficient for a self-hosted single-tenant deployment. Swap `src/store.ts`
for a database in production if you run multi-instance.

---

## Setup

### 1. Register the app with Ecwid

1. Sign up for the [Ecwid developer program][dev] and [register an app][register].
2. Note the **App ID** (`client_id`) and **secret key** (`client_secret`).
3. Set the app type to **external** (server-side), and request these scopes:
   - `read_store_profile` (always granted)
   - `customize_storefront` (required for the storefront loader)
4. Set the **return / redirect URL** to your public install callback, e.g.
   `https://convor-ecwid.example.com/install`.
5. Send Ecwid support the **HTTPS URL of the storefront loader**:
   `https://convor-ecwid.example.com/storefront.js` — this is what gets
   auto-injected on storefront pages.

[dev]: https://support.ecwid.com/hc/en-us/articles/5427022336796-Ecwid-developer-program-for-selling-apps
[register]: https://developers.ecwid.com/register

### 2. Configure environment

```sh
cp env.example .env
# Fill in ECWID_CLIENT_ID, ECWID_CLIENT_SECRET, ECWID_APP_ID, ECWID_REDIRECT_URL
```

### 3. Run

```sh
pnpm install        # or: npm install
pnpm --filter convor-ecwid dev    # tsx watch (hot reload)

# or build + run
pnpm --filter convor-ecwid build
pnpm --filter convor-ecwid start
```

The server listens on `PORT` (default `3000`). Open `http://localhost:3000/`
to walk through a manual install.

### 4. Install into a store

Either install from your app's App Market entry in the Ecwid Control Panel,
or visit `/` and click **Connect with Ecwid**. After OAuth you land in the
embedded settings form; enter your Convor org slug and save. The widget
appears on the storefront once the loader picks up the new public config.

---

## Marketplace submission

Before submitting to the [Ecwid App Market][market]:

1. **Loader URL registered** — confirm Ecwid support has
   `https://<your-host>/storefront.js` on file for your app.
2. **HTTPS everywhere** — the redirect URL, loader, and (recommended) the
   Convor `apiBase` must all be HTTPS.
3. **Billing** — for paid apps, integrate Ecwid's billing API. This app ships
   free; add a billing check before publishing if you charge.
4. **App details page** — provide icon, screenshots, description via the
   developer portal.
5. **Review** — Ecwid reviews app behavior, scopes, and the embedded UI.

[market]: https://www.ecwid.com/appmarket

---

## Development

```sh
pnpm --filter convor-ecwid typecheck   # tsc --noEmit
pnpm --filter convor-ecwid lint        # biome check .
pnpm --filter convor-ecwid format      # biome format --write .
```

Code style: Biome — 80-char width, double quotes, 2-space indent, semicolons,
trailing commas. TypeScript strict; no `as any` / `@ts-ignore`. All
merchant-supplied values are HTML-escaped before interpolation into views.
