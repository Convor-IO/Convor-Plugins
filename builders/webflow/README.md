# Convor for Webflow

Add the [Convor](https://convor.io) live-chat widget to your Webflow site by
pasting one script tag into your site's **Custom Code** panel. No app, no
package — just the standard Webflow code-injection flow.

> **Screenshots TBD.** This guide describes the verified 2026 Webflow UI;
> annotated screenshots will be added later.

## What you'll get

A floating chat bubble on every published page of your Webflow site, backed by
Convor's live-chat backend. Visitors can message you in real time; you reply
from the Convor dashboard.

## Prerequisites

- A **Convor** account (sign up at https://convor.io).
- Your organization's public **slug**. Find it in the Convor dashboard under
  **Settings → Widget**. It looks like `acme-inc`.
- A published (or publishable) **Webflow** site on any paid Workspace plan.
  Custom Code requires a paid site plan — it is disabled on the free Starter
  workspace.

## Step-by-step

1. **Copy your Convor slug** from the Convor dashboard
   (**Settings → Widget**).
2. In Webflow, open your project and go to **Site settings** (the gear icon in
   the left sidebar of the Designer, or from your Dashboard hover the project
   and click the gear).
3. Select the **Custom code** tab.
4. Scroll to the **Footer code** section (this is site-wide — it runs on every
   page). The **Head code** section also exists; for the widget, **Footer code**
   is correct so the script loads after page content.
5. **Paste the snippet** below, replacing `YOUR_ORG_SLUG` with your real slug.
6. Click **Save changes**.
7. **Publish** your site (top-right **Publish** → choose your domains →
   **Publish to selected domains**). Custom Code only takes effect on a
   published site — it does **not** render in the Designer canvas.

## The snippet

```html
<script src="https://cdn.convor.io/widget.js" data-key="YOUR_ORG_SLUG" async></script>
```

> Replace `YOUR_ORG_SLUG` with the exact slug from the Convor dashboard. It is
> case-sensitive. A standalone, copy-ready version is in
> [`snippet.html`](./snippet.html).

## Verify it's working

1. Visit your **published** site (not the `webflow.io` preview unless that's
   where you published).
2. Hard-refresh: **Cmd/Ctrl + Shift + R** to bypass cache.
3. You should see the Convor chat bubble in the corner (default: bottom-right).
4. To confirm the request fired, open **DevTools → Network**, filter for
   `widget.js`, and check the request is `200 OK` with the correct
   `data-key` on the script element (**Elements** tab).

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| No bubble appears | You didn't **Publish** after saving — Custom Code is ignored until the next publish. |
| Bubble appears in preview but not on the live domain | You published to `webflow.io` but not your custom domain. Re-publish and select the right domain. |
| Console error `404` on `widget.js` or config 404 | The `YOUR_ORG_SLUG` placeholder wasn't replaced, or it has a typo. Slugs are **case-sensitive**. Re-check Settings → Widget in Convor. |
| Widget blocked / flickers | A browser **ad blocker** or **privacy extension** (uBlock, Brave Shields) may block third-party scripts. Test in an incognito window with extensions off. |
| Content-Security-Policy error in console | If you added a CSP via Header code, you must allow `script-src https://cdn.convor.io` and `frame-src https://cdn.convor.io`. |
| Changes not visible after editing the dashboard | Convor appearance is cached briefly. Hard-refresh, or wait ~60 seconds for the config cache to expire. |

## Optional: customize appearance

All visual customization — **color, position (left/right, offsets), greeting
message, launcher icon, online/offline hours** — is configured in the Convor
dashboard under **Settings → Widget**, **not** in the snippet.

Edit it there: [Convor dashboard → Settings → Widget](https://convor.io).

The snippet stays exactly one line. Do not duplicate appearance settings in the
Webflow Custom Code panel — it creates drift between the two.

## References

- Webflow: [Custom code in head and body tags](https://university.webflow.com/lesson/custom-code-embed)
- Webflow Help: [Custom code in head and body tags](https://help.webflow.com/hc/en-us/articles/33961357265299-Custom-code-in-head-and-body-tags)

## License

MIT
