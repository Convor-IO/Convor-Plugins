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
real Chromium, asserting the widget `<script>` loads, `window.ConvorWidget`
becomes defined, and the trigger-button iframe mounts.

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
  fetches `/widget.js` (200); `window.ConvorWidget` is defined (loader ran);
  the trigger-button iframe is mounted.
- `sdk.spec.ts` — a static HTML page imports `@convor/widget-sdk`'s ESM
  bundle, calls `initConvor({slug, apiBase})`, and the same assertions hold.

### Honest gaps (not covered by either layer)

These need infrastructure that's out of scope for local CI:

- **Full chat flow** (open bubble → send message → realtime delivery).
  Requires the entire SaaS stack (server + Postgres + Centrifugo) running
  with a seeded org matching the slug. The iframe loads but its content is
  backend-dependent.
- **Real Shopify / BigCommerce / Ecwid OAuth install flows.** The JS apps
  boot and their snippet builders are unit-tested, but the platform OAuth
  + signed-payload verification paths aren't exercised against real backends.
- **Real Magento / Drupal / Joomla / PrestaShop / OpenCart installs.**
  Layer 1 proves the hook emits the snippet via PHP shims; a full CMS boot
  would catch hook-registration edge cases the shims can't. Magento in
  particular is heavy (~1.5GB image, multi-minute boot) and was deferred.
- **`cdn.convor.io` doesn't exist yet.** Every plugin defaults to it; nothing
  works end-to-end in production until that CDN stands up. Local tests use
  the built widget on `localhost:5173` instead.
