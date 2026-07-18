# Convor — Browser Extension

A Manifest V3 browser extension that injects the **Convor** live-chat widget
into any page you're viewing. Use it on sites that can't add the embed snippet
themselves — a SaaS dashboard, a lead-gen landing page you don't control, an
internal tool, a vendor's admin panel.

The widget is normally embedded with:

```html
<script src="https://cdn.convor.io/widget.js" data-key="ORG_SLUG" async></script>
```

This extension does exactly that — just from the browser, configured with your
org slug, on whichever page you point it at.

One codebase, two stores: **Chrome Web Store** (MV3) and **Firefox Add-ons
(AMO)**. The same `manifest.json` works for both; Firefox picks up
`browser_specific_settings.gecko`.

---

## Install for development

### Prerequisites

- Node.js 22.12+ and pnpm 11 (`corepack enable`)
- Python 3 + [Pillow](https://python-pillow.org) — only to regenerate the
  icons (committed PNGs are fine to use as-is)

### Build

```bash
cd browser-extension
pnpm install
pnpm build        # bundles src/*.ts -> dist/*.js
```

### Load unpacked

**Chrome / Edge / Brave (Chromium)**

1. Visit `chrome://extensions`
2. Toggle **Developer mode** on (top-right)
3. **Load unpacked** → select the `browser-extension/` folder
4. Click the Convor icon in the toolbar → **Options** → enter your org slug

**Firefox**

1. Visit `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on…** → select `browser-extension/manifest.json`
3. Same Options flow as above

The options page opens automatically on first install if no slug is set.

---

## How it works

### Permissions (kept deliberately narrow)

| Permission | Why |
| --- | --- |
| `storage` | Save `{ orgSlug, apiBase, autoInject, allowedSites }` to `chrome.storage.sync` (roams with the profile) |
| `activeTab` | Temporary access to the active tab when you click the toolbar icon — powers **Inject now** |
| `scripting` | `chrome.scripting.executeScript` to place the widget script tag into the page |
| `permissions` | Request/revoke per-site host access at runtime (optional host opt-in) |
| `optional_host_permissions` (`http://*/*`, `https://*/*`) | A *menu* of origins the user grants one host at a time — never granted automatically |
| `host_permissions` | **Empty by default.** No broad site access at install time |

> **Why no `<all_urls>` and no static `content_scripts`?** Broad host access
> triggers extra review friction on both stores and alarms users. Instead,
> **Inject now** uses the `activeTab` grant the popup earns on click, and
> **auto-inject** is opt-in per site: enabling it for a host requests that
> host's origin via `chrome.permissions.request` and adds it to `allowedSites`.
> The background worker then injects on future navigations to opted-in hosts.

### Injection mechanism

The extension injects the **canonical embed script** — identical to what a
site owner would paste, just done from the extension:

```js
const script = document.createElement("script");
script.src = `${apiBase}/widget.js`;
script.async = true;
script.setAttribute("data-key", orgSlug);
document.head.appendChild(script);
```

This runs via `chrome.scripting.executeScript` with `func` (a serialized
function shipped to the page's main world), so the widget loads exactly as it
would from a real embed. All appearance config (color, position, greeting)
stays server-side — fetched by the widget at runtime via the public config
endpoint. The extension does **not** duplicate appearance settings.

**CSP note:** some sites ship a strict Content-Security-Policy that blocks
third-party `<script>` sources. The widget tag will fail to load on those
pages — the extension surfaces this as a toast ("Can't inject here…"). There
is no way around a page's CSP from a content-script context without the user
relaxing it; this is by design.

### Files

```
browser-extension/
├── manifest.json              # MV3 manifest (Chrome + Firefox)
├── src/
│   ├── shared.ts              # types, defaults, host-matching, storage helpers
│   ├── background.ts          # service worker: onInstall -> options; auto-inject on tab load
│   ├── content-script.ts      # page-side injectConvorWidget() (shipped via executeScript)
│   ├── options.ts             # options page logic
│   └── popup.ts               # toolbar popup logic
├── options.html               # options page UI
├── popup.html                 # popup UI
├── icons/                     # 16/48/128 PNG (regenerate via `pnpm icons`)
├── scripts/generate-icons.py  # icon generator (Pillow)
├── tsup.config.ts             # bundle config (IIFE, no splitting)
├── tsconfig.json              # strict TS
├── biome.json                 # lint/format (matches repo conventions)
├── package.json
└── README.md
```

---

## Options page fields

| Field | Description |
| --- | --- |
| **Organization slug** | Required public slug from your Convor dashboard (Settings → Widget). Nothing injects without it. |
| **API base** | Where `widget.js` is served. Default `https://cdn.convor.io`; override for a self-hosted/staging CDN. |
| **Auto-inject on allowed sites** | Master switch. Off by default — most people use the popup's **Inject now**. |
| **Allowed sites** | One host per line. `example.com` matches itself + subdomains; `*.acme.io` matches any subdomain; `#` starts a comment. Auto-inject only fires on hosts listed here. |

### Popup

- Shows the configured org slug + a status badge (green = configured,
  amber = not configured).
- **Inject widget now** — injects into the active tab immediately.
- **Auto-inject on this site** — opts the current host into the allow-list and
  requests site access (toggle off to revoke).
- **Options** link to the full settings page.

---

## Build setup

- **TypeScript** strict mode (`strict`, `noUnusedLocals`,
  `noImplicitOverride`, etc.). No `as any` / `@ts-ignore`.
- **tsup** bundles the four entry points (`background`, `content-script`,
  `options`, `popup`) to self-contained IIFE files under `dist/`. No
  code-splitting — each context loads one file in isolation.
- **@types/chrome** + **webextension-polyfill** types for the
  `chrome`/`browser` namespace. The polyfill is type-only at build time; the
  bundle stays dependency-free (both Chrome and Firefox expose a compatible
  `chrome.*` API surface under MV3).
- **Biome** for lint/format: 80-char width, double quotes, 2-space indent,
  semicolons, trailing commas — mirroring the repo root.

```bash
pnpm build       # tsup -> dist/
pnpm typecheck   # tsc --noEmit
pnpm lint        # biome check .
pnpm format      # biome format --write .
pnpm icons       # regenerate icons/*.png from scripts/generate-icons.py
```

---

## Store submission notes

### Chrome Web Store

1. `pnpm build`, then zip `browser-extension/` (must include `manifest.json`,
   `dist/`, `icons/`, `popup.html`, `options.html`).
2. Create a new item at
   <https://chrome.google.com/webstore/devconsole/>.
3. Fill listing: name, summary, description, a 128×128 icon, 1–5 screenshots
   (capture the popup on a real page, the options page, and an injected
   widget). Provide a single-page "demo" URL where reviewers can verify
   inject behaviour.
4. **Permissions justification** — under "Permissions & Properties":
   - `storage`: persist user settings.
   - `activeTab` + `scripting`: inject the widget into the tab the user is
     actively viewing on click.
   - `permissions` + `optional_host_permissions`: optional per-site host
     opt-in for auto-inject; users grant one host at a time.
   - Make clear **no host permissions are requested at install** (the active
     permission set is `[]`).
5. Privacy: fill the data-usage disclosure. The extension sends only the org
   slug to `${apiBase}` (the Convor CDN) to load the widget — the same network
   call the embed snippet makes. No analytics, no telemetry from the extension
   itself.
6. Submit for review.

### Firefox Add-ons (AMO)

1. Same zip as Chrome (the shared MV3 manifest works).
2. Upload at <https://addons.mozilla.org/developers/>.
3. The `browser_specific_settings.gecko.id` (`convor@convor.io`) makes the
   add-on stable across installs. `strict_min_version: 115.0` (first Firefox
   with full MV3 support).
4. Source code: AMO requires uploading the human-readable source for any
   minified/compiled code. Zip `src/` + `tsup.config.ts` + `package.json` +
   `pnpm-lock` (or run `pnpm build` reproducibly) and attach as the source
   archive.
5. Submit for review.

### Firefox compatibility note

- Firefox MV3 supports `chrome.scripting.executeScript` and
  `chrome.permissions.request` exactly like Chrome (the `chrome` namespace is
  aliased). No runtime polyfill needed.
- `chrome.tabs.onUpdated` with `change.status === "complete"` is supported.
- `chrome.runtime.openOptionsPage()` works in both browsers.

---

## License

MIT, matching the rest of `Convor-Plugins`.
