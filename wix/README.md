# Convor for Wix

Embeds the [Convor](https://convor.io) live-chat widget on a Wix site and gives
the merchant a dashboard page to wire up their org.

This is a **self-managed Wix app** built with the **Wix CLI**. It ships one
**Embedded Script** site extension (injects the widget loader into the site
DOM) and one **dashboard page** (where the merchant enters their Convor org
slug). All appearance customization lives server-side in Convor — this app
intentionally does **not** duplicate it.

## What this app does

1. **Settings (dashboard page)** — the merchant opens Convor from their Wix
   dashboard, pastes their **Convor org slug**, and clicks Save. The backend
   (`backend/settings.web.js`) calls the Wix **Embedded Scripts API**
   (`embeddedScripts.embedScript`) to persist the slug as the `{{slug}}`
   parameter of the widget-loader extension.
2. **Widget injection (embedded script)** — the extension renders
   `<script src="https://cdn.convor.io/widget.js" data-key="<slug>" async>`
   into the DOM of every published page. The widget fetches its appearance
   config from Convor at runtime.

No inline JS — the loader is an external file from the Convor CDN, which keeps
site CSP clean.

## File layout

```
wix/
├── wix-app.config.ts                  # App manifest (name, extensions)
├── extensions/
│   └── embedded-script/               # Embedded Script site extension
│       ├── config.json                #   metadata + {{slug}} parameter
│       ├── script.html                #   the injected HTML/JS fragment
│       ├── params.dev.json            #   dev-time slug for `wix dev`
│       └── README.md
├── settings-panel/                    # Dashboard page (merchant UI)
│   ├── Settings.tsx                   #   React form (slug → Save)
│   ├── config.json                    #   dashboard-page metadata
│   └── README.md
├── backend/
│   ├── settings.web.js                # Velo web module: validate + embed
│   └── README.md                      #   storage-choice rationale
├── package.json
├── tsconfig.json
├── env.example                        # WIX_APP_ID, WIX_APP_SECRET, …
└── README.md                          # ← you are here
```

## The settings flow — how the slug reaches the script

```
merchant ── settings-panel/Settings.tsx ──▶ Convor org slug
                       │
                       ▼  saveSettingsWM({ slug })  (webMethod)
         backend/settings.web.js#saveSettings
                       │
                       ▼  embeddedScripts.embedScript({ parameters: { slug } })
              Wix persists the {{slug}} parameter server-side
                       │
                       ▼  (every page render)
   extensions/embedded-script/script.html with {{slug}} substituted
                       │
                       ▼
 <script src="https://cdn.convor.io/widget.js" data-key="<slug>" async>
                       │
                       ▼
            Convor widget boots on the storefront
```

Single source of truth: the slug lives only in Wix's embedded-script state. We
do **not** keep a second copy in a `wix-data` collection (see
[`backend/README.md`](./backend/README.md) for the rationale).

## Prerequisites

- Node `>=22.12 <23`
- A **Wix Developers** account and a test site (https://dev.wix.com)
- The **Wix CLI** — install it globally:

  ```bash
  npm install -g @wix/cli
  ```

- A **Convor** account and your org slug
  (Convor dashboard → **Settings → Widget**).

## Setup

```bash
cd wix
pnpm install

# Copy env and fill in WIX_APP_ID / WIX_APP_SECRET from your Wix Developers
# workspace (https://dev.wix.com → your app → OAuth & API).
cp env.example .env
```

`wix dev` will prompt you to log in with your Wix account and pick the test
site to develop against.

## Develop

```bash
wix dev
```

This opens a local editor that:

- Watches `wix-app.config.ts` and the extension folders.
- Substitutes the dev values in
  `extensions/embedded-script/params.dev.json` (`{ "slug": "acme-store" }`)
  into `script.html` so you can see the widget render without wiring up the
  full settings flow.
- Hot-reloads the dashboard page in `settings-panel/`.

Change the value in `params.dev.json` and reload to test different slugs.

## Deploying & submitting to the Wix App Market

```bash
# 1. Push the app (manifest + extensions + dashboard page) to your Wix
#    Developers workspace.
wix app deploy

# 2. In the Wix Developers workspace (https://dev.wix.com), open the app and
#    submit it for review against the Wix App Market Guidelines.
#    https://dev.wix.com/docs/build-apps/launch-your-app/submit-your-app-to-the-wix-app-market
```

Self-managed apps require at least one site extension to be publishable — the
Embedded Script extension here satisfies that requirement. (Code-only / Velo-only
apps can't be submitted to the App Market.)

### App Market review checklist

Before submitting, make sure:

- [ ] The Embedded Script `scriptType` matches your consent model
      (`ESSENTIAL` loads without the consent banner; switch to `FUNCTIONAL` to
      gate it).
- [ ] The dashboard page renders, saves, and removes the slug cleanly on a
      fresh test site.
- [ ] The widget actually loads on a published page after Save (verify in the
      browser network tab that `https://cdn.convor.io/widget.js` is requested
      with the correct `data-key`).
- [ ] App icon, screenshots, and listing copy are uploaded in the Wix
      Developers workspace.

## Monetization

Convor for Wix is a **free** app in the App Market. Wix's terms give the
developer 100% of revenue in year 1 and 80% after (a 2.5% transaction fee is
deducted first), should you later add paid plans via the Wix Billing API.

## License

MIT
