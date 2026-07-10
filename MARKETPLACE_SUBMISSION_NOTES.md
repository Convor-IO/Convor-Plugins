# Convor Hosted Platform Marketplace Notes

Use this file for durable, non-secret handoff notes while finishing Shopify,
BigCommerce, and Ecwid marketplace setup.

Do not paste client secrets, access tokens, recovery codes, or passwords here.
Chrome should save generated account passwords. Store platform secrets in the
deployment secret manager and local `.env` files only.

## Global Account Rules

- Account email: `admin@convor.io`
- Passwords: strong generated passwords saved in the local ignored secrets note
- Marketing/newsletter checkboxes: opt out everywhere

## Shared Runtime

- Tunnel command: `cloudflared tunnel --url http://localhost:3000`
- Current tunnel URL: `https://editor-vsnet-jill-house.trycloudflare.com`
- Active app on port 3000: BigCommerce Fastify dev server
- Postgres `DATABASE_URL` location:
  `postgres://postgres:postgres@localhost:10432/convor_plugins`
- Local Postgres status: running in Docker container
  `convor-marketplace-postgres` as of 2026-07-06.
- Local tunnel tooling status: running through Docker container
  `convor-marketplace-tunnel` as of 2026-07-07. Quick-tunnel hosts can expire;
  update all platform callback URLs if this URL rotates.
- Chrome automation status: connected as of 2026-07-07.
- Local secrets note: `MARKETPLACE_SUBMISSION_SECRETS.md` stores generated
  account passwords and is excluded through the local submodule git exclude.

## Shopify

- Partner account status: account, email verification, and partner
  organization complete. Logged in as `admin@convor.io`. Shopify Partner
  organization ID: `5033088`; Dev Dashboard organization ID: `225459078`.
- App name: `Convor Live Chat`
- App URL: `https://editor-vsnet-jill-house.trycloudflare.com`
- Redirect URLs:
  - `https://editor-vsnet-jill-house.trycloudflare.com/auth/callback`
  - `https://editor-vsnet-jill-house.trycloudflare.com/auth/callback/inline`
  - `https://editor-vsnet-jill-house.trycloudflare.com/auth/login`
- Client ID location: local ignored secrets note and `shopify/.env`
- Client secret location: local ignored secrets note and `shopify/.env`
- Development store domain: `convor-live-chat-dev.myshopify.com`
- OAuth verified: yes, app installed on dev store on 2026-07-07.
- Settings save verified: yes, `convor.widget` shop metafield contains
  `{"slug":"convor","apiBase":"https://cdn.convor.io"}`.
- Theme app embed verified: yes. `Convor` app embed enabled and saved on the
  `test-data` live theme on 2026-07-07.
- Storefront widget visible: script injection verified on password-unlocked
  storefront. The live HTML includes `https://cdn.convor.io/widget.js` with
  `data-key="convor"`.
- App Store listing status: public distribution selected on 2026-07-07.
  `Manage submission` now opens `Register for the Shopify App Store`, which is
  gated by a one-time `$19` app store registration fee and an `Add payment
  method` button before the listing editor/media upload flow is available.
  Asset upload is blocked until the user completes that payment step.
- Assets needed:
  - Prepared Shopify-ready assets are in
    `marketplace-assets/shopify/README.md`.
  - App icon: `marketplace-assets/shopify/icon-1200.png`
  - Static feature media: `marketplace-assets/shopify/feature-media-1600x900.png`
  - English screenshots: 5 files matching
    `marketplace-assets/shopify/screenshot-*.png`. The removed
    Shopify integrations-list screenshot is intentionally absent.
- Notes:
  - Active Shopify app version: `marketplace-extension-smoke-2`, version ID
    `1041750720513`.
  - Live theme used for smoke test: `test-data`, theme ID `197789614240`.
  - Storefront password is in the ignored local secrets note.
  - Local smoke-test fixes made: root now injects Shopify App Bridge provider,
    Polaris `AlphaStack` usage replaced with `BlockStack`, Vite uses existing
    file routes, allows the current tunnel host, and disables HMR for tunnel
    hosts.
  - Shopify CLI removed deprecated `[build].include_config_on_deploy` during
    deploy. Theme Check reported missing locale-directory `ENOENT` warnings for
    the extension, but validation and release still succeeded.

## BigCommerce

- Developer Tools account status: trial store activated, store dashboard is
  accessible, and Developer Portal app creation works in Chrome.
- App name: `Convor Live Chat`
- Developer Portal app ID: `66332`
- Auth callback URL:
  `https://editor-vsnet-jill-house.trycloudflare.com/auth`
- Load URL: `https://editor-vsnet-jill-house.trycloudflare.com/load`
- Uninstall URL:
  `https://editor-vsnet-jill-house.trycloudflare.com/uninstall`
- Client ID location: local ignored secrets note and `bigcommerce/.env`
- Client secret location: local ignored secrets note and `bigcommerce/.env`
- Trial store domain: `store-9bzlzdiuix.mybigcommerce.com`
- Store preview domain: `convor-live-chat.mybigcommerce.com`
- Store hash: `9bzlzdiuix`
- OAuth verified: yes, app installed on the trial store on 2026-07-07.
- Settings save verified: yes, `convor` / `https://cdn.convor.io` persisted in
  local Postgres table `bigcommerce_settings`.
- Script injection verified: yes. BigCommerce Scripts API returned the enabled
  `Convor Widget` script, UUID `4436223d-637c-4876-bb79-eca223d64175`, with
  `kind: script_tag`, `location: head`, and `visibility: storefront`.
- Storefront widget visible: verified in the BigCommerce admin storefront
  preview URL. The installed inline wrapper creates
  `https://cdn.convor.io/widget.js` with `data-key="convor"`. The public
  storefront URL still returns BigCommerce's `Coming Soon` page, so curl/public
  unauthenticated HTML does not show storefront scripts until the trial store is
  launched.
- UAT submission status: listing editor is filled through the BigCommerce
  Developer Portal `Listing information` tab. The marketplace category is set
  to `Live Chat`; public resource URLs are filled; free billing is selected;
  screenshots were added manually by the user on 2026-07-07. Five feature
  entries are filled and saved. Case studies are intentionally omitted because
  BigCommerce's prompt asks for merchant benefit proof and Convor does not yet
  have real BigCommerce merchant outcomes. Listing changes saved successfully
  in the portal on 2026-07-07 (`Changes saved.` toast observed). Continue from
  `App Actions` / marketplace submission.
- Listing features saved:
  - `One-click storefront script install`
  - `Centralized widget configuration`
  - `AI-assisted customer conversations`
  - `Conversation history for every store`
  - `Safe install, update, and uninstall flow`
- Submission blocker: `Publish to App Marketplace...` was attempted on
  2026-07-07 and the portal showed `Please include a partner ID to submit your
  app.` BigCommerce docs state the Partner ID is required for submission and is
  assigned after partner approval. Do not fill a guessed ID; complete
  BigCommerce partner approval / retrieve Convor's assigned Partner ID, then
  enter it and submit again. Expect the normal review/listing payment step
  after this blocker.
- Partner application status: submitted on 2026-07-07 through
  `https://partners.bigcommerce.com/prm/English/s/applicant`, using the
  Technology Partner route. BigCommerce confirmation page showed:
  `Thank you. Your form has been submitted.` The application used
  `admin@convor.io`, which the page warned may be treated as an alias email; if
  BigCommerce rejects it, restart the partner application with an individual
  company email. Watch email for approval/onboarding and the assigned Partner
  ID, then enter that Partner ID in the Developer Portal marketplace submission
  flow and submit `Convor Live Chat` again.
- Notes:
  - Account UUID: `90e9697f-7640-4fdd-b256-d6468af5505b`
  - OAuth scopes saved in Developer Portal: `Content: Modify` and
    `Information and Settings: Modify`.
  - Callback URLs saved and verified after reload in Developer Portal.
  - Code fixes made during real install:
    - OAuth token exchange host corrected to `https://login.bigcommerce.com`.
    - `/load` now prefers `signed_payload_jwt` over the legacy
      `signed_payload` parameter when BigCommerce sends both.
    - Widget settings persist in Postgres instead of the old REST store
      metafields route. BigCommerce's current store-metafield docs route
      store-level metafields through Admin GraphQL.
    - Scripts API paths updated to `/v3/content/scripts`.
    - Script creation now sends `kind: "script_tag"` and an inline wrapper,
      because Convor's widget loader requires `data-key` on the created script
      element.

## Ecwid

- Developer account status: current docs route API setup through an Ecwid store
  at `https://my.ecwid.com/#develop-apps`, not the old developer portal
  register flow. Ecwid account/store created for `admin@convor.io`. Store ID:
  `138804517`. Onboarding completed up to plan selection. Ecwid documents that
  paid plans are required for API access, but they provide a free paid-plan
  upgrade for test stores after a public app idea is approved.
- App Market request status: submitted on 2026-07-07 through
  `https://portal.ecwid.com/en-us/app-market-request`, after Ecwid support
  replied on ticket `6231876` that no Convor application existed yet and the
  app registration steps must be started first. Confirmation page showed:
  `Thank you! We will be sending you more information on how to get started!`
  Newsletter opt-in was left unchecked; required Privacy Policy checkbox was
  accepted. Approval email received on 2026-07-07: Ecwid/Lightspeed approved
  the `Convor Live Chat app` request and asked for the Development Form next.
  That form creates the `-dev` app version and includes Partner Agreement
  setup fields. Use the same email (`admin@convor.io`) and app/theme name
  (`Convor Live Chat`) for expedited processing. After Development Form
  submission, Ecwid says they will email the App Readiness Form, then create a
  `-prod` version and send validation instructions. Do not mention the
  temporary Cloudflare tunnel as a permanent redirect or storefront-script URL;
  send permanent production URLs only after the Ecwid app record exists.
- Development Form status: prepared in Chrome on 2026-07-07 but not submitted.
  Ecwid docs were checked at
  `https://docs.ecwid.com/launch-apps/native-and-external-apps`; Convor's
  current Ecwid implementation is an **external app**, not a native app,
  because it uses the external OAuth `code` flow and stores access tokens
  server-side. The form is set to `No - this is an external app`, free billing,
  requested scopes `CUSTOMIZE_STOREFRONT` and `READ_STORE_PROFILE`, webhook
  `application.uninstalled`, Store ID `138804517`, and Partner Agreement prep
  fields filled from TopSoft4U legal data. Remaining required blocker:
  stable public external-app endpoint URLs. The redirect URL should point to
  the deployed Ecwid app's `/install`; OpenApp URL should point to the deployed
  external dashboard/settings entry point. Avoid using a temporary tunnel here
  unless Ecwid confirms it is acceptable for the dev app only.
- App name: `Convor Live Chat`
- Redirect URI:
  blocked pending stable deployed Ecwid app URL
- Client ID location:
- Client secret location:
- Numeric App ID:
- Storefront script URL for support:
- `customize_storefront` request status:
  requested in prepared Development Form; not submitted until endpoint URLs are
  stable
- OAuth verified:
- Settings save verified:
- Storefront widget visible:
- Review submission status:
- Notes:
  - Official support routes:
    - Docs:
      `https://docs.ecwid.com/contact-ecwid-api-support-team#email-support`
    - Form:
      `https://portal.ecwid.com/en-us/en-us/contact-the-apps-team`
  - Ecwid says to include store and application IDs for faster support. Store
    ID is known (`138804517`); app ID is not available until app creation.
  - Draft request:
    Subject: Free developer upgrade for Convor Live Chat public App Market app

    Hello Ecwid API Support,

    We are developing `Convor Live Chat`, a public application for the Ecwid
    App Market. It embeds the Convor live-chat widget into merchant storefronts
    and provides an app settings flow for merchants to connect their Convor org.

    Could you please grant the documented free paid-plan developer upgrade for
    our test store so we can access the Ecwid API and complete OAuth/install
    verification in a safe development environment?

    Store email: admin@convor.io
    Store ID: 138804517
    App name: Convor Live Chat

    We can send the application ID and permanent production URLs as soon as the
    app record is available.

    Thank you.

## Code Readiness

- BigCommerce token persistence: Postgres table `bigcommerce_tokens`
- BigCommerce widget settings persistence: Postgres table
  `bigcommerce_settings`
- BigCommerce uninstall callback: verifies `signed_payload_jwt`
- Ecwid token/settings persistence: Postgres table `ecwid_stores`
- Ecwid uninstall webhook: verifies `X-Ecwid-Webhook-Signature`
- Last local verification:
  - BigCommerce: `npm run lint`, `npm run typecheck`
    - Real install verified on store `9bzlzdiuix`.
    - Postgres rows verified in `bigcommerce_tokens` and
      `bigcommerce_settings`.
    - Scripts API verified enabled script UUID
      `4436223d-637c-4876-bb79-eca223d64175`.
    - Storefront preview verified the inline wrapper and generated widget
      script with `data-key="convor"`.
  - Ecwid: `npm run lint`, `npm run typecheck`
  - Shopify: `npx tsc --noEmit`; OAuth/install/settings smoke test passed
    locally through Cloudflare tunnel; theme extension deploy succeeded with
    app version `marketplace-extension-smoke-2`; app embed enabled and
    storefront script injection verified.
  - Ecwid lint exits successfully with one remaining Biome config deprecation
    info in `ecwid/biome.json`.
