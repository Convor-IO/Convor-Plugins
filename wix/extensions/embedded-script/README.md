# Convor Widget — Embedded Script extension

This is the **Embedded Script** site extension for the Convor Wix app. It
injects the Convor widget loader into the DOM of every published page on the
merchant's Wix site.

## Files

| File | Purpose |
|---|---|
| `config.json` | Extension metadata: id, name, `scriptType`, `placement`, and the `slug` dynamic parameter declaration. |
| `script.html` | The HTML/JS fragment injected into the site DOM. Renders the canonical `<script src="https://cdn.convor.io/widget.js" data-key="…" async>`. |
| `params.dev.json` | Values for the `slug` parameter used during local dev (`wix dev`). The merchant's real value is supplied in production via the Embedded Scripts API. |

## What the snippet does

```html
<script src="https://cdn.convor.io/widget.js" data-key="YOUR_ORG_SLUG" async></script>
```

`data-key` is the merchant's public Convor org slug (visible in the Convor
dashboard under **Settings → Widget**). The widget script fetches all
appearance config (color, position, greeting, allowed domains) at runtime
from the Convor API — nothing appearance-related is duplicated here.

## How the slug reaches the script

The slug is a **Wix dynamic parameter** declared in `config.json` and
referenced as `{{slug}}` inside `script.html`. The flow is:

```
merchant ── settings-panel/ (dashboard page) ──▶ Convor org slug
                          │
                          ▼  (Save)
        backend/settings.web.js → embeddedScripts.embedScript({ parameters: { slug } })
                          │
                          ▼  (Wix persists the parameter server-side)
          Wix serves script.html with {{slug}} substituted
                          │
                          ▼
   <script src="https://cdn.convor.io/widget.js" data-key="<slug>" async>
```

1. The merchant opens the **Convor** dashboard page in their Wix dashboard.
2. They paste their Convor org slug and click **Save**.
3. The dashboard page calls the Wix backend (`backend/settings.web.js`), which
   calls `embeddedScripts.embedScript({ scriptId, parameters: { slug } })` from
   `@wix/app-management`.
4. Wix stores that parameter server-side, associated with the installed
   extension, and substitutes it into `script.html` whenever the site renders.

The snippet itself is defensive: if `{{slug}}` is empty (extension installed
but not yet configured), it emits an HTML comment instead of a broken tag, so
shoppers never see anything and a merchant inspecting the page gets a hint.

## Why `scriptType: ESSENTIAL` and `placement: BODY_END`

- **`ESSENTIAL`** — the chat widget is core functionality the merchant
  deliberately installed, so it loads without waiting for visitor consent.
  Switch to `FUNCTIONAL` if you'd rather gate it behind Wix's consent banner.
- **`BODY_END`** — load the widget after page content so it never blocks first
  paint. The widget itself is `async`.

## Testing locally

```bash
cd wix
wix dev
```

`wix dev` substitutes the values in `params.dev.json` (`{ "slug": "acme-store" }`)
into `script.html` so you can see the widget render on your test site without
wiring up the full settings flow. Change the value in `params.dev.json` and
reload to test different slugs.

## Reference

- [Add a self-managed embedded script extension](https://dev.wix.com/docs/build-apps/develop-your-app/develop-a-self-managed-app/supported-extensions/site-extensions/embedded-scripts/add-a-self-managed-embedded-script-extension)
- [Embedded Scripts API — `embedScript`](https://dev.wix.com/docs/api-reference/app-management/embedded-scripts/embed-script)
