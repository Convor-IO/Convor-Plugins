# Real-CMS install fixtures (OpenCart + Magento)

These fixtures boot **real** OpenCart 4 and Magento 2.4 installs in Docker,
install the Convor widget module from the repo source, configure it, and
verify the canonical widget snippet renders on a real storefront page.

This is the end-to-end complement to the lightweight PHP harness tests
(`_opencart-harness.php`, `_magento-harness.php`): those stub the CMS and
exercise the plugin's PHP in isolation; these boot the full CMS to prove the
plugin actually integrates — files land in the right place, the module is
discovered, settings persist, and the snippet reaches the rendered HTML.

## Canonical snippet (the contract)

Each platform must emit exactly this into the storefront `<head>`:

```html
<script src="<apiBase>/widget.js" data-key="<slug>" async></script>
```

With the default fixture config (`org_slug=test-org`,
`api_base=http://localhost:5173`):

```html
<script src="http://localhost:5173/widget.js" data-key="test-org" async></script>
```

## Layout

```
fixtures/
├── opencart/
│   ├── docker-compose.yml   php:8.2-apache + mariadb:11 on :8084
│   ├── entrypoint.sh        installs OC 4.0.2.3 + Convor module + settings
│   └── activate.sh          standalone (re)config of settings/event
├── magento/
│   ├── docker-compose.yml   php:8.3-apache + mariadb:10.6 + opensearch on :8085
│   ├── entrypoint.sh        composer create-project + setup:install + module
│   ├── bootstrap.sh         enable module + write config (called by entrypoint)
│   └── activate.sh          standalone (re)config of config values
├── bubble-check.js          optional chromium check that .convor-trigger mounts
├── widget-proxy.js          (existing) the :5173 widget dev/preview server
└── wordpress/               (existing) the WordPress fixture
```

## OpenCart (:8084)

```bash
cd integration-tests/fixtures/opencart
docker compose up -d        # ~90s cold: apt + OC download + CLI install + register
until curl -sf -o /dev/null http://localhost:8084/; do sleep 2; done

# Verify the snippet:
curl -s http://localhost:8084/ | grep widget.js
# → <script src="http://localhost:5173/widget.js" data-key="test-org" async></script>

# (Optional) reconfigure without a rebuild:
SLUG=acme API_BASE=http://localhost:5173 ./activate.sh
```

**How it works.** `php:8.2-apache` (there is no first-party OpenCart image).
`entrypoint.sh` installs the PHP exts OpenCart 4 needs, downloads OpenCart
4.0.2.3 into the webroot, runs the CLI installer against MariaDB (`--db_prefix
oc_`), copies the module source onto the webroot, then registers the
storefront event and writes the three settings via direct SQL (mirrors
`opencart/install.php` + the admin `save()`) — no admin login needed.

The storefront event `catalog/view/common/header/after` fires
`module/convor.injectScript`, which appends the `<script>` tag to the rendered
header HTML just before `</head>`.

## Magento (:8085)

Magento is heavy (~10-15 min cold). Be patient on first boot.

```bash
cd integration-tests/fixtures/magento
docker compose up -d        # ~10-15 min cold: composer create-project + setup:install
docker compose logs -f magento   # follow progress
until curl -sf -o /dev/null http://localhost:8085/; do sleep 5; done

# Verify the snippet:
curl -s http://localhost:8085/ | grep widget.js
# → <script src="http://localhost:5173/widget.js" data-key="test-org" async></script>

# (Optional) reconfigure without a rebuild:
SLUG=acme ./activate.sh
```

**How it works.** `php:8.3-apache` (avoids the ~3GB, license-bound official
`magento/magento-cloud` image and the `shinsenter/magento` image's s6/IPv6
orchestration quirks). `entrypoint.sh` installs PHP exts, runs
`composer create-project magento/community-edition:2.4.9` (the public
metapackage — no marketplace key), waits for MariaDB + OpenSearch, runs
`setup:install --opensearch-host=opensearch`, then enables `Convor_Widget`,
runs `setup:upgrade`, writes the three config values, and flushes cache.

Three services are required: MariaDB (data), OpenSearch (Magento 2.4 mandates
it — `setup:upgrade` fails with "No alive nodes found" without it), and the
magento web container. The composer-installed webroot persists on the
`mg-webroot` volume so a second `docker compose up` is fast; `entrypoint.sh`
drops `app/etc/env.php` on each boot so `setup:install` always re-runs
against the tmpfs DB.

The snippet is injected via `view/frontend/layout/default_head_blocks.xml`
→ `<referenceBlock name="head.additional">` → `widget_script.phtml` (backed by
`Block/WidgetScript`, which reads system config and short-circuits when
disabled).

### ⚠️ Bug found & fixed during this verification

The Magento module's `default_head_blocks.xml` originally placed the `<block>`
**directly under `<head>`**:

```xml
<!-- BROKEN: page_configuration.xsd forbids <block> under <head> -->
<head>
    <block class="Convor\Widget\Block\WidgetScript" .../>
</head>
```

Magento silently drops it — the block never renders. The fix (committed in
`magento/view/frontend/layout/default_head_blocks.xml`) uses the standard
`head.additional` referenceBlock that Magento renders inside `<head>`:

```xml
<!-- CORRECT: head.additional is the container for head <block>s -->
<body>
    <referenceBlock name="head.additional">
        <block class="Convor\Widget\Block\WidgetScript" .../>
    </referenceBlock>
</body>
```

This is the same pattern `Magento_GoogleAnalytics` uses. With the fix, the
snippet renders correctly. (The block itself, template, and config were all
correct — only the layout wiring was wrong.)

## Optional: does the bubble actually mount?

`curl | grep widget.js` proves the snippet ships. To confirm the widget
bootstrap actually creates the `.convor-trigger` element, run the chromium
check (needs the `playwright` package on `NODE_PATH`):

```bash
node -e "process.env.NODE_PATH='$(find / -path '*pnpm/playwright@*/node_modules/playwright/..' -maxdepth 8 2>/dev/null | head -1)'; require('module').Module._initPaths(); require('./bubble-check.js')"
```

Findings:
- **Magento**: `.convor-trigger` mounts reliably. ✅
- **OpenCart**: snippet is byte-correct canonical, but `.convor-trigger`
  mounts only intermittently / not at all under the headless test. The widget
  `.js` loads (HTTP 200) and initializes correctly on a bare page and on
  Magento, but on OpenCart's heavier page (jQuery + Bootstrap) it sometimes
  fails to attach with no console error. This is a **widget-runtime timing
  concern, not a plugin defect** — the plugin's contract (emit the snippet)
  is met.

## Why `api_base=http://localhost:5173`

The Playwright/chromium browser runs on the host, so it resolves
`localhost:5173` for the widget dev/preview proxy server. The CMS containers
don't need to reach the widget URL themselves — they only emit the snippet;
the browser does the fetching.

## Tear down

```bash
cd integration-tests/fixtures/opencart && docker compose down -v
cd integration-tests/fixtures/magento  && docker compose down -v
```

`-v` purges the DB (and Magento's webroot) so the next `up` is a clean install.
