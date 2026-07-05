# Convor Live Chat — PrestaShop module

Add the [Convor](https://convor.io) live-chat widget to your PrestaShop store.
Install the module, paste your organization slug into the settings, and the
chat bubble goes live on every page.

## What it does

The module injects a single script tag into the store `<head>`:

```html
<script src="https://cdn.convor.io/widget.js" data-key="your-org-slug" async></script>
```

That script loads the Convor widget, which renders an iframe chat bubble and
talks to the Convor REST API + Centrifugo WebSocket. All appearance settings
(colour, position, greeting, etc.) live in your Convor dashboard and are fetched
at runtime via `GET /api/widget/config?key=<slug>` — the module deliberately
does **not** duplicate them.

## Requirements

- PrestaShop **1.7.0.0** or newer (1.7 / 8.x / 9.x).
- PHP **7.4** or newer (the module avoids PHP 8-only syntax so it runs on
  PrestaShop's older PHP floor too).

## Install

1. Package this directory's contents as `convor.zip` so the files sit directly
   at the archive root (no extra parent folder). The installed module must live
   at `modules/convor/` in your shop:

   ```bash
   cd Convor-Plugins/prestashop
   zip -r convor.zip . -x README.md
   ```

2. In the PrestaShop back office go to **Improve → Modules → Module Manager**
   and click **Upload a module**. Pick `convor.zip`.

3. Once installed, click **Configure** and enter:
   - **Enabled** — on/off switch (keeps your settings when off).
   - **Organization slug** — your Convor public slug, e.g. `acme-inc`.
   - **API base URL** — widget CDN base, defaults to `https://cdn.convor.io`.
     Override only if you have a custom endpoint.

4. Save. The widget appears on the storefront immediately.

## Configuration keys

Stored in the PrestaShop `ps_configuration` table:

| Key                | Default                | Notes                              |
|--------------------|------------------------|------------------------------------|
| `CONVOR_ENABLED`   | `1`                    | `1` / `0` — master on/off switch.  |
| `CONVOR_ORG_SLUG`  | *(empty)*              | Required — no slug, no widget.      |
| `CONVOR_API_BASE`  | `https://cdn.convor.io`| Trailing slash is stripped.        |

## How the widget gets on the page

The module registers the `displayHeader` hook. On each front-office request it
reads the config above and, when enabled and a slug is set, renders
[`views/templates/hook/header.tpl`](views/templates/hook/header.tpl). The
template prints the script tag with both attributes escaped via Smarty's
`escape` modifier.

## Uninstall

Removing the module deletes the three `CONVOR_*` configuration keys.

## Distribution

This is a free, open-source module. PrestaShop's Addons Marketplace only permits
registered partners to publish free modules, so it is **self-distributed**: ship
the ZIP from your own site / GitHub releases. Merchants install it via the
back-office "Upload a module" flow described above.

## License

Same license as the surrounding `Convor-Plugins` repository.
