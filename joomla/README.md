# Convor Live Chat — Joomla 5 System Plugin

Add the [Convor](https://convor.io) live-chat widget to your Joomla 5 site.
Install the plugin, enter your organization slug, and the widget loads on every
front-end page via a single script tag injected into the document `<head>`.

The widget is one script tag:

```html
<script src="https://cdn.convor.io/widget.js" data-key="YOUR_ORG_SLUG" async></script>
```

All appearance customization (color, position, greeting, allowed domains) is
fetched at runtime from the Convor dashboard — this plugin only manages the
organization slug, the script base URL, and a master switch, so there is no
configuration drift.

## Requirements

- Joomla **5.x**
- PHP **8.1+**

## Install

### Via Joomla installer (recommended)

1. Zip the contents of this folder (the `convor.php`, `convor.xml`, and
   `language/` entries must be at the top level of the archive):

   ```bash
   cd joomla
   zip -r plg_system_convor.zip convor.php convor.xml language README.md
   ```
2. In the Joomla administrator, go to **System → Extensions → Install** and
   upload the zip, or use the *Install from Folder* / *Install from URL* options.
3. After install, go to **System → Manage → Plugins**, find **System - Convor**,
   and open it.

### From source

Copy `convor.php`, `convor.xml`, and the `language/` folder into
`plugins/system/convor/`, then run **Discover** in the Extension Manager and
install the discovered plugin.

## Configure

1. In the plugin's options (**Plugins → System - Convor**):
   - Set **Enable Convor Widget** to *Yes*.
   - Enter your **Organization Slug** (found in the Convor dashboard under
     *Settings → Widget*).
   - (Optional) Adjust **Widget Script Base URL** — defaults to
     `https://cdn.convor.io`. Only change this to point at a custom CDN or a
     staging environment.
2. Save.

## How it works

- The plugin binds to the `onBeforeCompileHead` system event, which fires for
  every page render before the document `<head>` is compiled.
- It reads its params (`enabled`, `org_slug`, `api_base`), and when the master
  switch is on and a slug is set, it injects the widget script.
- The script is registered through Joomla 5's `WebAssetManager` so the
  `data-key` and `async` attributes are attached to the tag cleanly and the
  asset is de-duplicated. A `addCustomTag()` fallback covers setups where the
  asset manager cannot register a remote script.
- **Front-end only:** the widget is never injected in the administrator
  backend or for non-HTML document types (feeds, raw, JSON, etc.).

## Code quality / JED

- Follows the [Joomla Coding Standards](https://manual.juno.one/).
- Output is escaped with `htmlspecialchars()` (`ENT_QUOTES`, UTF-8).
- The script URL is validated as an `http(s)` URL before injection.
- `php -l` clean.
- Pre-validate with [JED Checker](https://jedchecker.joomlaextensions.me/) and
  submit to the [Joomla Extensions Directory](https://extensions.joomla.org/).

## License

GNU General Public License version 2 or later.
