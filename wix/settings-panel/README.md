# Convor — Wix settings panel (dashboard page)

The merchant-facing page that appears when a merchant opens the Convor app from
their Wix dashboard. It is the only UI in this app: a single form where they
enter their Convor org slug.

This is a **Wix dashboard page** built with React + `@wix/design-system`. The
Wix CLI bundles it on `wix app deploy` and registers it as the app's dashboard
entry point (see `config.json`).

## Files

| File | Purpose |
|---|---|
| `Settings.tsx` | React component. Loads the current slug, lets the merchant edit and save it, and offers a "Remove from site" action. |
| `config.json` | Dashboard-page extension metadata (`id`, `name`, `entry`). |

## What it does

1. On mount, calls `getSettingsWM()` (a `webMethod` wrapper around
   `backend/settings.web.js#getSettings`) to load the currently-embedded slug.
2. The merchant edits the slug and clicks **Save** → `saveSettingsWM({ slug })`
   validates the slug and calls the Wix Embedded Scripts API to (re)embed the
   widget loader with the new value.
3. **Remove from site** → `clearSettingsWM()` un-embeds the script.

The panel deliberately exposes **only the slug**. Colors, position, greeting,
allowed domains, etc. are configured in the Convor dashboard and fetched at
runtime by the widget — surfacing them here would create drift between Wix and
Convor.

## How the slug reaches the script

```
Settings.tsx ──saveSettingsWM({ slug})──▶ backend/settings.web.js
                                              │
                                              ▼  embeddedScripts.embedScript(...)
                                   Wix persists the {{slug}} parameter
                                              │
                                              ▼
                extensions/embedded-script/script.html renders with the slug
                                              │
                                              ▼
          <script src="https://cdn.convor.io/widget.js" data-key="<slug>" async>
```

## Why `webMethod`

`webMethod` (from `@wix/essentials`) wraps the backend call so it runs with
site-owner elevation. That lets `embeddedScripts.embedScript` succeed without
delegating sensitive scopes to the merchant's browser session.

## Reference

- [Dashboard pages](https://dev.wix.com/docs/build-apps/develop-your-app/configure-your-app/extensions/dashboard-pages)
- [`@wix/design-system`](https://www.npmjs.com/package/@wix/design-system)
- [`webMethod`](https://dev.wix.com/docs/velo/api-reference/$w/web-modules)
