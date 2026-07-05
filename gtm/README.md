# Convor Widget — Google Tag Manager template

A [Google Tag Manager](https://tagmanager.google.com/) **custom tag template** that
injects the [Convor](https://convor.io) live-chat widget onto your site. Marketers
can add Convor through GTM with no developer and no code edits — they create a tag
from this template, enter their org slug, and publish.

## Files

| File | Purpose |
|---|---|
| [`template.tpl`](./template.tpl) | The GTM custom template — import this into your container. |
| [`README.md`](./README.md) | This file: import + usage guide. |
| [`examples/screenshot-instructions.md`](./examples/screenshot-instructions.md) | A textual walkthrough of every GTM UI screen. |
| [`LICENSE`](./LICENSE) | MIT. |

## What the template injects

The Convor widget is a single script tag sourced from the Convor CDN:

```html
<script src="https://cdn.convor.io/widget.js" data-key="YOUR_ORG_SLUG" async></script>
```

`data-key` is your organization's **public** slug (visible in the Convor dashboard
under **Settings → Widget**). All appearance configuration — colors, position,
greeting, allowed domains — is fetched at runtime from the Convor API, so the tag
stays minimal.

### How the slug reaches the widget

GTM's sandboxed `injectScript()` API can load a script from a URL but **cannot
attach `data-*` attributes** to the injected `<script>` tag. So this template
delivers the org slug to the widget through **both** of these channels (the widget
honors whichever it reads first):

1. **Global config object.** Before loading the widget, the tag sets
   `window.ConvorConfig = { key: "<org-slug>" }` via GTM's `setInWindow` API.
   The widget reads `window.ConvorConfig.key` at startup.
2. **Query parameter.** The slug is also appended to the script URL as
   `?key=<org-slug>` (`https://cdn.convor.io/widget.js?key=<slug>`), which the
   widget can read from its own `<script src>`.

Optional appearance overrides (`primaryColor`, `position`, `theme`) are added to
`window.ConvorConfig.appearance`. Leave them blank to use the values configured in
the Convor dashboard.

## Import the template

1. **Download** [`template.tpl`](./template.tpl) from this repo to your computer.
2. In GTM, open your container and go to **Templates** in the left sidebar.
3. Click **New** in the *Tag Templates* section.
4. Click the **⋮ (More)** menu in the top-right → **Import**.
5. Select the `template.tpl` file you downloaded. The Template Editor opens,
   showing the *Convor Widget* fields and permissions.
6. Click **Save** → **Close**. The template now appears in your *Tag Templates*
   list as **Convor Widget**.

> Permissions are pre-configured: the template may inject scripts from
> `https://cdn.convor.io/*` (and `https://*.convor.io/*`) and read/write the
> `window.ConvorConfig` global. No other permissions are requested.

## Create a tag from the template

1. Go to **Tags** → **New**.
2. Click **Tag Configuration** → in the *Custom* group, pick **Convor Widget**.
3. Fill in:
   - **Organization slug** — your Convor org slug, e.g. `acme-store`. *(Required.
     Find it in the Convor dashboard under **Settings → Widget**.)*
   - **Widget script base URL** — leave blank for the production default
     (`https://cdn.convor.io`).
   - *(Optional)* expand **Appearance overrides** to set a `primaryColor`,
     `position`, or `theme`. Leave blank to use the dashboard values.
4. Click **Triggering** → choose **All Pages** (or a more specific trigger if you
   only want Convor on part of the site).
5. **Save**, name the tag (e.g. *Convor Widget*).

## Test and publish

1. Click **Preview** (top-right). GTM opens Tag Assistant in a new tab.
2. Load a page on your site. In Tag Assistant, confirm the **Convor Widget** tag
   shows **Tag Fired**, and that `https://cdn.convor.io/widget.js?key=…` appears
   in the page's network requests. The chat bubble should appear.
3. If it didn't fire: check the trigger, confirm the slug matches the dashboard,
   and verify the site's domain is in the widget's *allowed domains* list.
4. Back in GTM, click **Submit** → **Publish** to push the tag live.

## Troubleshooting

- **Widget doesn't appear.** Confirm the tag fired in Preview mode, the slug is
  correct, and your site's domain is listed under *Allowed domains* in the Convor
  dashboard.
- **`injectScript` blocked by permissions.** This happens if you changed the
  *Widget script base URL* to a host not in the allowlist. Open the template in
  the Template Editor → **Permissions** → add your host to *Injects Scripts*.
- **Want the dashboard-managed look instead of the per-tag overrides?** Clear the
  *Appearance overrides* fields — when blank, the widget uses the dashboard values.

## Reference

- [Convor](https://convor.io)
- [GTM Custom Templates docs](https://developers.google.com/tag-platform/tag-manager/templates)
- [GTM sandboxed JS API reference](https://developers.google.com/tag-platform/tag-manager/templates/api)
