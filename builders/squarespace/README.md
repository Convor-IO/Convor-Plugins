# Convor for Squarespace

Add the [Convor](https://convor.io) live-chat widget to your Squarespace site
by pasting one script tag into **Code Injection**. Squarespace has an Extensions
marketplace, but it is curated and limited — for a custom widget like Convor,
**Code Injection is the recommended, supported path**.

> **Screenshots TBD.** This guide describes the verified 2026 Squarespace UI;
> annotated screenshots will be added later.

## What you'll get

A floating chat bubble on every page of your Squarespace site, backed by
Convor's live-chat backend. Visitors can message you in real time; you reply
from the Convor dashboard.

## Prerequisites

- A **Convor** account (sign up at https://convor.io).
- Your organization's public **slug**. Find it in the Convor dashboard under
  **Settings → Widget**. It looks like `acme-inc`.
- A **Squarespace** site on a plan that supports **Code Injection**.
  - ✅ **Business**, **Commerce Basic**, **Commerce Advanced** (and the newer
    **Core / Plus / Advanced** commercial plans) all support Code Injection.
  - ❌ The **Personal** plan does **not** include Code Injection. If you're on
    Personal, upgrade to Business or higher, or use a per-page **Code Block**
    workaround (see [Alternative below](#alternative-code-block-on-personal)).

## Step-by-step (Code Injection — recommended)

1. **Copy your Convor slug** from the Convor dashboard
   (**Settings → Widget**).
2. In Squarespace, open your site's **Home Menu**.
3. Go to **Settings → Advanced → Code Injection**.
   - If **Code Injection** is missing under Advanced, your plan doesn't
     include it — see the plan note above.
4. Scroll to the **Footer** field. (The **Header** field also exists; for the
   widget, **Footer** is correct so it loads after page content.)
5. **Paste the snippet** below, replacing `YOUR_ORG_SLUG` with your real slug.
6. Click **Save**.
7. Code Injection takes effect on the live site after save — no separate
   publish required, but a hard refresh may be needed to bypass cache.

## The snippet

```html
<script src="https://cdn.convor.io/widget.js" data-key="YOUR_ORG_SLUG" async></script>
```

> Replace `YOUR_ORG_SLUG` with the exact slug from the Convor dashboard. It is
> case-sensitive. A standalone, copy-ready version is in
> [`snippet.html`](./snippet.html).

## Verify it's working

1. Visit your **live** Squarespace domain (not the editor).
2. Hard-refresh: **Cmd/Ctrl + Shift + R**.
3. You should see the Convor chat bubble in the corner (default: bottom-right).
4. To confirm the request fired, open **DevTools → Network**, filter for
   `widget.js`, and check the request is `200 OK`.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| **Code Injection menu is missing** | Your plan is **Personal**, which doesn't include it. Upgrade to Business+, or use the [Code Block workaround](#alternative-code-block-on-personal). |
| No bubble appears after save | Hard-refresh to bypass Squarespace's CDN cache. If still missing, confirm the slug is correct. |
| `<!-- Sqs modules not loaded -->` or script stripped | Make sure you pasted into the **Footer** of **Code Injection** (not into a text field that escapes HTML). |
| Console error `404` on config | The `YOUR_ORG_SLUG` placeholder wasn't replaced, or it has a typo. Slugs are **case-sensitive**. |
| Widget blocked / flickers | A browser **ad blocker** or **privacy extension** (uBlock, Brave Shields) may block third-party scripts. Test in incognito with extensions off. |
| Content-Security-Policy error | Squarespace's default CSP is permissive; this only happens if you added a custom one. Allow `script-src https://cdn.convor.io` and `frame-src https://cdn.convor.io`. |
| Old appearance after editing dashboard | Hard-refresh, or wait ~60 seconds for the Convor config cache to expire. |

## Alternative: Code Block (on Personal)

If you're on the **Personal** plan and can't use Code Injection, you can add the
snippet to **individual pages** via a Code Block:

1. Edit a page → **Add Section** → choose **Code** (or add a **Code Block**
   inside any section).
2. Paste the snippet (it accepts raw HTML).
3. Repeat per page — Code Blocks are **not** site-wide, which is why Code
   Injection is strongly preferred.

> Code Blocks are a workaround, not a first-class integration. For a true
> site-wide install, upgrade to a Business plan and use Code Injection.

## Why not the Extensions marketplace?

Squarespace **Extensions** is a curated marketplace focused on shipping,
booking, and marketing integrations. It does not currently support a generic
"inject this snippet" widget category in a way that's simpler than Code
Injection, and listing requires a Squarespace partnership review. For a live-chat
widget, **Code Injection is faster, more flexible, and under your full control.**
If a packaged Convor Extension becomes available in future, it will be
documented here.

## Optional: customize appearance

All visual customization — **color, position (left/right, offsets), greeting
message, launcher icon, online/offline hours** — is configured in the Convor
dashboard under **Settings → Widget**, **not** in the snippet.

Edit it there: [Convor dashboard → Settings → Widget](https://convor.io).

The snippet stays exactly one line. Do not duplicate appearance settings in
Code Injection — it creates drift between the two.

## References

- Squarespace Help: [Using code injection](https://support.squarespace.com/hc/en-us/articles/205815908-Using-code-injection)
- Squarespace Help: [Adding custom code to your site](https://support.squarespace.com/hc/en-us/articles/205815928-Adding-custom-code-to-your-site)

## License

MIT
