# Convor — Wix backend (Velo web modules)

Server-side code that runs in Wix's managed Velo runtime. These modules are
called from the merchant-facing dashboard page in `../settings-panel/`.

## Files

| File | Purpose |
|---|---|
| `settings.web.js` | Web module exposing `getSettings` / `saveSettings` / `clearSettings`. Validates the slug and (un)embeds the script via the Wix Embedded Scripts API. |

## Storage choice — why no `wix-data` collection

The slug is **not** stored in a `wix-data` collection. Instead we hand it
straight to the **Wix Embedded Scripts API** (`embeddedScripts.embedScript`),
which persists the parameter server-side and associates it with the installed
extension. Wix then substitutes it into `script.html`'s `{{slug}}` on every
page render.

This keeps a single source of truth: Wix's own embedded-script state. The
widget the shopper gets is *exactly* what `getSettings()` would return — there
is no second copy that can drift.

If you genuinely need a separate store (e.g. to keep an audit log or per-page
overrides), the conventional Wix pattern is a private `wix-data` collection
named `ConvorSettings` with `Permissions` set to **Admin only** and a single
row keyed by the site's instance id. We do not need that here.

## Permissions

`.web.js` modules run with **site-owner elevation** — the calls to
`embeddedScripts` succeed without delegating scopes to the visitor, and the
slug never reaches the browser until `getSettings()` explicitly returns it.

## Reference

- [`embeddedScripts.embedScript`](https://dev.wix.com/docs/api-reference/app-management/embedded-scripts/embed-script)
- [`embeddedScripts.getCurrent`](https://dev.wix.com/docs/api-reference/app-management/embedded-scripts/get-current)
- [Web modules (Velo)](https://dev.wix.com/docs/velo/api-reference/$w/web-modules)
