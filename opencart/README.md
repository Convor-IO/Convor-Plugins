# Convor Live Chat — OpenCart 4 Module

Embeds the [Convor](https://convor.io) live-chat widget on your OpenCart 4
storefront. Install, paste in your organization slug, enable — done. All
appearance customization (color, position, greeting, etc.) is configured in
the Convor dashboard and fetched at runtime, so there is nothing else to
set up here.

## Requirements

- OpenCart **4.x** (namespaced controllers, Events system, Twig).

## What it does

The module registers a storefront **event** that fires after the common
header template is rendered and appends the canonical Convor script tag to
the page `<head>`:

```html
<script src="https://cdn.convor.io/widget.js" data-key="YOUR_ORG_SLUG" async></script>
```

It reads three settings from the OpenCart `setting` table:

| Key                              | Purpose                                            | Default            |
| -------------------------------- | -------------------------------------------------- | ------------------ |
| `module_convor_widget_status`    | `1` to enable, `0` to disable                      | `0`                |
| `module_convor_widget_org_slug`  | Your organization's public slug (Convor dashboard) | *(empty)*          |
| `module_convor_widget_api_base`  | Where to load `widget.js` from                     | `https://cdn.convor.io` |

## File layout

```
opencart/
├── admin/
│   ├── controller/module/convor.php        # admin controller (form + save + install/uninstall hooks)
│   ├── language/en-gb/module/convor.php     # English language strings
│   └── view/template/module/convor.twig     # admin configuration form
├── catalog/
│   ├── controller/module/convor.php         # event callback: injectScript()
│   └── view/template/module/convor.twig     # reference script-tag template (override point)
├── install.php                              # registers the storefront event
├── uninstall.php                            # removes the event + purges settings
└── README.md
```

## How the event works

OpenCart 4's `Loader::view()` fires a `view/<route>/after` event after a
template is rendered, passing three **by-reference** arguments:

```php
$this->event->trigger('view/' . $route . '/after', [&$route, &$data, &$output]);
```

`install.php` registers a listener for `catalog/view/common/header/after`
pointing at `module/convor.injectScript`. That callback appends the Convor
`<script>` tag to `&$output` (the rendered header HTML).

> Why append to `$output` instead of pushing into `$data['scripts']`? The
> header template renders the `scripts` array as `<script src="{{ script.href }}">`
> — a plain URL with no room for the `data-key` / `async` attributes the
> Convor loader requires. Editing `$output` directly is the documented and
> idiomatic way to add arbitrary markup via a `view/.../after` event.

## Installing

### From the Extensions installer (recommended)

1. Zip the `opencart/` contents following the OpenCart 4 packaging layout
   (an `install.json` + the `admin/`, `catalog/` trees), upload it under
   **Extensions → Installer**, and click **Install**.
2. Go to **Extensions → Extensions → Modules**, find **Convor Live Chat**,
   click the green **+** (Install) — this registers the event automatically
   via `Admin\Controller\Module\Convor::install()`.
3. Click **Edit**, set **Status** to Enabled, enter your **Organization
   Slug**, and **Save**.

### Manual file copy

Copy the `admin/` and `catalog/` folders over your OpenCart root, then run
`install.php` from the admin context (or click Install in the Modules list,
which runs the same registration).

## Uninstalling

Click **Uninstall** in the Modules list (runs
`Admin\Controller\Module\Convor::uninstall()`) — or run `uninstall.php`.
Both remove the `convor_widget` event and delete the saved settings.

## Security

- The org slug is URL-encoded for the request path and HTML-escaped for the
  `data-key` attribute before insertion.
- The api base is HTML-escaped.
- Admin actions are gated on `modify` permission for `module/convor`.
- The storefront handler fails silent when disabled or misconfigured so the
  store never breaks because of the widget.

## License

MIT
