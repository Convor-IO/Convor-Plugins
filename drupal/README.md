# Convor Widget (Drupal module)

Embeds the [Convor](https://convor.io) live-chat widget on a Drupal 11 site.

## What it does

Convor is a live-chat SaaS. The widget is a single `<script>` tag:

```html
<script src="<apiBase>/widget.js" data-key="<org-slug>" async></script>
```

This module injects that tag into the `<head>` of every page when enabled, and
provides an admin settings form where you enter your organization slug (the
public `data-key`) and optionally override the script base URL.

All widget appearance — color, position, greeting text, online hours — is
configured in the Convor dashboard and applied server-side. **This module does
not duplicate appearance settings** (doing so creates drift).

## Requirements

- Drupal 11 (`core_version_requirement: ^11`)
- PHP 8.1+

## Installation

### Via Composer (recommended for D11)

```bash
composer require convor/widget
drush pm:enable convor_widget
```

### Manual

Copy the `convor_widget/` directory into `web/modules/contrib/` and enable it
under **Extend** (`admin/modules`) or with `drush pm:enable convor_widget`.

## Configuration

1. Go to **Configuration → Web services → Convor widget**
   (`/admin/config/services/convor-widget`).
2. Check **Enable the Convor widget**.
3. Enter your **Organization slug** (find it in your Convor dashboard under
   *Widget → Install*).
4. Optionally override the **Widget script base URL** (defaults to
   `https://cdn.convor.io`).
5. Save.

You need the **Administer Convor widget** permission (`administer convor
widget`) to access the settings form.

## How the tag is injected

The widget tag carries a dynamic, per-organization `data-key` attribute, so the
cleanest, cache-safe Drupal approach is to emit it directly as a `<head>` element
via `hook_page_attachments()` + `#attached['html_head']`:

```php
$script_element = [
  '#type' => 'html_tag',
  '#tag' => 'script',
  '#attributes' => [
    'src' => $src,
    'data-key' => $org_slug,
    'async' => TRUE,
  ],
];
$attachments['#attached']['html_head'][] = [$script_element, 'convor_widget'];
```

The Renderer escapes the attribute values — no raw HTML is echoed. The attached
tag's cacheability (it depends only on `convor_widget.settings`) is bubbled into
the page attachments, so cached pages invalidate when settings change.

This avoids shipping a separate loader JS asset that would have to read
`drupalSettings` and synthesize the tag at runtime, and matches how the widget is
embedded on every other platform.

## Hooks / API

| Hook | Purpose |
| --- | --- |
| `hook_page_attachments()` | Attaches the `<script>` tag and bubbles config cacheability. |
| `hook_help()` | Documentation on the module's help page. |

## Permissions

- **Administer Convor widget** (`administer convor widget`) — required to
  access the settings form.

## License

GPL-2.0-or-later, same as Drupal core.
