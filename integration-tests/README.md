# Convor plugin integration tests

Two layers of verification that the plugins actually work end-to-end.

## Layer 1: snippet-emission tests (`run-all.js`)

For every plugin, asserts the canonical widget snippet is emitted by the
plugin's hook/template/route. PHP plugins run under a real PHP runtime
(`php -S`) with minimal CMS shims; JS apps boot their Fastify server;
the browser extension loads in JSDOM; GTM runs in a sandboxed stub.

```bash
cd integration-tests
npm install
node run-all.js   # → 11/11 platform tests pass
```

The shared `assert-snippet.js` defines what "canonical" means and is the
single source of truth — every test uses it.

## Layer 2: real-browser E2E (`e2e/`, Playwright)

Goes further: boots a real WordPress install in Docker and loads pages in
real Chromium, asserting the widget `<script>` loads, `window.Convor` becomes
defined, and the trigger-button iframe mounts.

### Prerequisites

1. **Built widget on :5173** (served with correct `text/javascript` content-type —
   the dev server returns `text/html`, which the browser refuses to execute):

   ```bash
   cd saas/apps/widget
   pnpm build                                   # produces dist/widget.js
   pnpm exec vite preview --port 5173 --host    # serves dist/ on :5173
   ```

2. **Built SDK** (for the SDK E2E):

   ```bash
   cd plugins && pnpm --filter='@convor/widget-sdk' build
   ```

3. **WordPress on :8080** (for the WP E2E):

   ```bash
   cd integration-tests/fixtures/wordpress
   docker compose up -d
   # Run the famous 5-minute install:
   curl -s -o /dev/null -X POST 'http://localhost:8080/wp-admin/install.php?step=2' \
     -d 'weblog_title=Convor Test' \
     -d 'user_name=admin' -d 'admin_password=admin' -d 'admin_password2=admin' \
     -d 'pw_weak=1' -d 'admin_email=admin@example.com' -d 'blog_public=0' -d 'language='
   # Activate plugin + set org_slug=acme, api_base=http://localhost:5173:
   ./activate.sh   # helper script (uses docker compose exec db mariadb ...)
   ```

### Run

```bash
cd plugins
WIDGET_API_BASE=http://localhost:5173 pnpm exec playwright test \
  --config integration-tests/playwright.config.ts
# → 2/2 E2E tests pass (wordpress + sdk)
```

### What each E2E proves

- `wordpress.spec.ts` — real Chromium loads the WP home page; the canonical
  `<script src="…/widget.js" data-key="acme" async>` is present; the browser
  fetches `/widget.js` (200); `window.Convor` is defined (loader ran);
  the trigger-button iframe is mounted.
- `sdk.spec.ts` — a static HTML page imports `@convor/widget-sdk`'s ESM
  bundle, calls `initConvor({slug, apiBase})`, and the same assertions hold.

### Honest gaps (not covered by either layer)

These need infrastructure that's out of scope for local CI:

- **Real Shopify / BigCommerce / Ecwid OAuth install flows.** The JS apps
  boot and their snippet builders are unit-tested, but the platform OAuth
  + signed-payload verification paths aren't exercised against real backends.
- **`cdn.convor.io` doesn't exist yet.** Every plugin defaults to it; nothing
  works end-to-end in production until that CDN stands up. Local tests use
  the built widget on `localhost:5173` instead.

## Layer 3: real CMS install fixtures (`fixtures/`)

Each PHP platform has a Docker fixture that boots a real CMS install with
the plugin bind-mounted from source. Verified by booting the full stack and
grepping the rendered storefront HTML for the canonical snippet.

| Fixture | CMS | Port | Status |
|---|---|---|---|
| `fixtures/wordpress/` | WordPress 6.x + MariaDB | :8080 | ✅ snippet renders + full chat flow (Playwright E2E) |
| `fixtures/joomla/` | Joomla 5 + MariaDB | :8081 | ✅ snippet renders |
| `fixtures/prestashop/` | PrestaShop 8 + MySQL | :8082 | ✅ snippet renders |
| `fixtures/drupal/` | Drupal 11 + Postgres | :8083 | ✅ snippet renders |
| `fixtures/opencart/` | OpenCart 4 + MariaDB | :8084 | ✅ snippet renders |
| `fixtures/magento/` | Magento 2.4.9 + MariaDB + OpenSearch | :8085 | ✅ snippet renders |

Each fixture has its own `docker-compose.yml` + `install.sh`/`activate.sh`.
Booting all 6 at once requires the local widget stack up:

```bash
# 1. SaaS test infra (Postgres + Redis + Centrifugo)
cd saas && docker compose -f docker/docker-compose.test.yml up -d

# 2. Push schema + boot the server
cd packages/db && DATABASE_URL='postgresql://convor:convor@localhost:10010/convor_test' pnpm db:push
cd apps/server && cp .env.test .env && node --env-file=.env --import tsx/esm src/index.ts

# 3. Build the widget + start the proxy (serves widget dist + proxies /api to :3000)
cd apps/widget && pnpm build
cd plugins/integration-tests/fixtures && node widget-proxy.js

# 4. Boot a CMS fixture (e.g. WordPress)
cd fixtures/wordpress && docker compose up -d && ./activate.sh

# 5. Verify
curl -s http://localhost:8080/ | grep widget.js   # → the canonical snippet
```

### Real bugs found via the CMS fixtures

These all passed the Layer-1 shim tests but failed on real CMS boots:

- **Joomla**: `$this->getApplication()` returns null in legacy-loaded
  plugins (the CMSPlugin base isn't injected). Fixed to `Factory::getApplication()`.
  Separately, `WebAssetManager` is locked by `onBeforeCompileHead` time, so
  `registerScript()` throws and the tag is dropped. Fixed to use `addCustomTag()`.
- **Drupal**: `BubbleableMetadata::applyTo()` was called *after* adding the
  `html_head` attachment, wholesale-replacing `#attached` and discarding the
  script tag. Fixed the call order.
- **Magento**: `default_head_blocks.xml` placed `<block>` directly under
  `<head>`, which Magento's `page_configuration.xsd` forbids — the block
  was silently dropped. Fixed to use `<referenceBlock name="head.additional">`.
- **Magento CSP**: the WebSocket policy was attached to `img-src` (governs
  images) instead of `connect-src` (governs WS), so production realtime
  would have been CSP-blocked. Fixed earlier in the integration pass.
- **WordPress**: `get_config()` stripped the `widgetUrl` filter value, so
  the `data-widget-url` attribute (needed for local testing + self-hosted
  iframe deployments) was never emitted. Fixed to pass it through.
