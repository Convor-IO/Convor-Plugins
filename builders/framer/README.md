# Convor for Framer

Add the [Convor](https://convor.io) live-chat widget to your Framer site by
pasting one script tag into your site's **Custom Code** panel. No plugin
marketplace install — just the standard Framer code-injection flow.

> **Screenshots TBD.** This guide describes the verified 2026 Framer UI;
> annotated screenshots will be added later.

## What you'll get

A floating chat bubble on every page of your Framer site, backed by Convor's
live-chat backend. Visitors can message you in real time; you reply from the
Convor dashboard.

## Prerequisites

- A **Convor** account (sign up at https://convor.io).
- Your organization's public **slug**. Find it in the Convor dashboard under
  **Settings → Widget**. It looks like `acme-inc`.
- A **Framer** site on any paid plan. Custom Code is available on all paid
  plans (it is not available on the free Hobby tier).

## Step-by-step

1. **Copy your Convor slug** from the Convor dashboard
   (**Settings → Widget**).
2. Open your site in the **Framer editor**.
3. Click **Site Settings** (top-right). In recent Framer versions this opens a
   panel with a **Custom Code** section in the left sidebar; on older builds
   it's under the **General** tab — scroll down to find it.
4. Under **Custom Code**, locate the **End of `<body>` tag** field. This is the
   correct slot for the widget (it loads after page content). Do **not** use
   "Start of `<head>`" — that can race with the DOM.
5. **Paste the snippet** below into the **End of `<body>` tag** box, replacing
   `YOUR_ORG_SLUG` with your real slug.
6. Click **Save** (or **Publish** — Framer applies Custom Code on the next
   publish).
7. **Publish** your site (top-right **Publish** → **Update**). Custom Code
   does not run in the editor canvas preview — only on the published site.

## The snippet

```html
<script src="https://cdn.convor.io/widget.js" data-key="YOUR_ORG_SLUG" async></script>
```

> Replace `YOUR_ORG_SLUG` with the exact slug from the Convor dashboard. It is
> case-sensitive. A standalone, copy-ready version is in
> [`snippet.html`](./snippet.html).

## Verify it's working

1. Visit your **published** Framer site (the live domain, not the editor).
2. Hard-refresh: **Cmd/Ctrl + Shift + R** to bypass cache.
3. You should see the Convor chat bubble in the corner (default: bottom-right).
4. To confirm the request fired, open **DevTools → Network**, filter for
   `widget.js`, and check the request is `200 OK`.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| No bubble appears | You saved but didn't **Publish**. Framer only serves Custom Code on the published site. |
| Bubble shows in `framer.website` staging but not your domain | You need to publish to the custom domain. Open **Publish** and confirm the domain is connected. |
| Console error `404` on `widget.js` or config 404 | The `YOUR_ORG_SLUG` placeholder wasn't replaced, or it has a typo. Slugs are **case-sensitive**. Re-check Settings → Widget in Convor. |
| Widget blocked / flickers | A browser **ad blocker** or **privacy extension** (uBlock, Brave Shields) may block third-party scripts. Test in an incognito window with extensions off. |
| Content-Security-Policy error | If you added a CSP via Framer, allow `script-src https://cdn.convor.io` and `frame-src https://cdn.convor.io`. |
| Old appearance after editing dashboard | Hard-refresh, or wait ~60 seconds for the Convor config cache to expire. |

## Optional: customize appearance

All visual customization — **color, position (left/right, offsets), greeting
message, launcher icon, online/offline hours** — is configured in the Convor
dashboard under **Settings → Widget**, **not** in the snippet.

Edit it there: [Convor dashboard → Settings → Widget](https://convor.io).

The snippet stays exactly one line. Do not duplicate appearance settings in
Framer's Custom Code panel — it creates drift between the two.

## References

- Framer Help: [Using custom code](https://www.framer.com/help/using-custom-code/)
- Framer Help: [How to add custom code](https://www.framer.com/help/articles/how-to-add-custom-code/)

## License

MIT
