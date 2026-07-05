# Convor for Duda

Add the [Convor](https://convor.io) live-chat widget to your Duda site by
pasting one script tag into the **Custom Code** panel. Duda has an App Store,
but for a single-snippet widget, **Custom Code injection is the simplest,
fastest path** and is fully supported per-site.

> **Screenshots TBD.** This guide describes the verified 2026 Duda UI;
> annotated screenshots will be added later.

## What you'll get

A floating chat bubble on every page of your Duda site, backed by Convor's
live-chat backend. Visitors can message you in real time; you reply from the
Convor dashboard.

## Prerequisites

- A **Convor** account (sign up at https://convor.io).
- Your organization's public **slug**. Find it in the Convor dashboard under
  **Settings → Widget**. It looks like `acme-inc`.
- A **Duda** site on a **Team** plan or higher. Custom Code (the Head/Body-end
  HTML fields) is available on Team plans and above; it is not available on the
  entry-level Solo/Studio tiers.

## Step-by-step (Custom Code — recommended)

1. **Copy your Convor slug** from the Convor dashboard
   (**Settings → Widget**).
2. Open your site in the **Duda editor**.
3. In the left side panel, click **Settings** (under the **More** / `•••` menu
   in some layouts).
4. Open the **Custom Code** section.
5. Locate the **Body-end HTML** field. This is the correct slot for the widget
   (it loads after page content). Avoid the **Head HTML** field — it can cause
   the script to load before the DOM is ready, and some Duda Consent Management
   Platforms (CMP) gate `<head>` scripts behind the cookie banner.
6. **Paste the snippet** below into **Body-end HTML**, replacing
   `YOUR_ORG_SLUG` with your real slug.
7. Click **Save**.
8. **Publish** the site (top-right **Publish** → **Publish to all devices**).
   Custom Code renders on the published site; in the editor preview it appears
   only after a save.

## The snippet

```html
<script src="https://cdn.convor.io/widget.js" data-key="YOUR_ORG_SLUG" async></script>
```

> Replace `YOUR_ORG_SLUG` with the exact slug from the Convor dashboard. It is
> case-sensitive. A standalone, copy-ready version is in
> [`snippet.html`](./snippet.html).

## Verify it's working

1. Visit your **published** Duda site (the live domain, not the editor).
2. Hard-refresh: **Cmd/Ctrl + Shift + R** to bypass cache.
3. You should see the Convor chat bubble in the corner (default: bottom-right).
4. To confirm the request fired, open **DevTools → Network**, filter for
   `widget.js`, and check the request is `200 OK`.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| **Custom Code menu is missing** | Your plan is below **Team**. Upgrade, or use the HTML-widget workaround (see [Alternative below](#alternative-html-widget)). |
| No bubble appears | You saved but didn't **Publish**. Duda serves Custom Code on the published site. |
| Widget appears only after accepting the cookie banner | The snippet is in **Head HTML** and a CMP is gating it. Move it to **Body-end HTML**. |
| Console error `404` on config | The `YOUR_ORG_SLUG` placeholder wasn't replaced, or it has a typo. Slugs are **case-sensitive**. |
| Widget blocked / flickers | A browser **ad blocker** or **privacy extension** (uBlock, Brave Shields) may block third-party scripts. Test in incognito with extensions off. |
| Content-Security-Policy error | Allow `script-src https://cdn.convor.io` and `frame-src https://cdn.convor.io` in any custom CSP you've added. |
| Old appearance after editing dashboard | Hard-refresh, or wait ~60 seconds for the Convor config cache to expire. |

## Alternative: HTML widget

If Custom Code isn't available on your plan, you can drop the snippet into a
specific page via the **HTML widget**:

1. Edit a page → **Widgets** (left panel) → drag the **HTML** widget onto the
   canvas.
2. Paste the snippet and click **Update**.
3. Repeat per page — the HTML widget is **per-placement**, not site-wide.

This is a workaround; Custom Code (Body-end) is the recommended site-wide path.

## App Store option (future)

Duda's **App Store** lets partners ship a packaged app that injects code across
all pages via the [Site Wide HTML API](https://developer.duda.co/docs/site-wide-code),
and provides a settings UI inside Duda. That's the right model for a
multi-tenant distribution with one-click install — but it requires building and
submitting a Duda app (partner account, review, hosting a settings endpoint).

For most teams, **Custom Code per site** is faster to ship today. When a
packaged Convor app is published to the Duda App Store, it will be documented
here.

## Optional: customize appearance

All visual customization — **color, position (left/right, offsets), greeting
message, launcher icon, online/offline hours** — is configured in the Convor
dashboard under **Settings → Widget**, **not** in the snippet.

Edit it there: [Convor dashboard → Settings → Widget](https://convor.io).

The snippet stays exactly one line. Do not duplicate appearance settings in
Duda Custom Code — it creates drift between the two.

## References

- Duda Support: [Custom Code](https://support.duda.co/hc/en-us/articles/115005884928-Including-Custom-HTML-Code-in-Your-Site)
- Duda Support: [Site Settings](https://support.duda.co/hc/en-us/articles/26519963676695-Site-Settings)
- Duda Developers: [Site Wide HTML](https://developer.duda.co/docs/site-wide-code)

## License

MIT
