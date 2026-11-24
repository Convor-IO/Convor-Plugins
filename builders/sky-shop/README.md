# Convor live chat on Sky-Shop

Sky-Shop supports a site-wide **custom JavaScript/HTML** section. Use it to
install Convor without WordPress, a theme-code editor, or a Sky-Shop WebAPI
credential. This is a **manual widget embed**, not a native Sky-Shop app or an
approved marketplace listing. An official directory listing requires Sky-Shop's
approval.

## Install

1. In Convor, select the **website** where you want conversations to arrive.
   Open **Settings → Widget → Installation and security**. Copy the entire
   embed snippet. The public key begins with `convor_wpk_`. Do not use an
   organization slug, secret API key or WebAPI token.
2. In Sky-Shop administration open **Integracje → Własny kod JavaScript/HTML/CSS**
   and select **W nagłówku &lt;HEAD&gt;**. Sky-Shop's official help also lists global
   BODY code; use the global location rather than checkout/conversion-only
   fields. Preserve any existing unrelated scripts.
3. Paste the script once. The sample below illustrates its form, but the
   dashboard version is authoritative. If the dashboard includes an optional
   `data-convor-verification` attribute, retain it for site verification.
4. **Zapisz** (Save). Visit the **published storefront**, not just a theme
   preview. Confirm that the widget appears on the homepage and product page.
5. Open Convor's inbox for the selected website. From an incognito window,
   open the chat and send a message; reply as an operator. Confirm the reply
   arrives. A visible bubble alone is not a passed installation test.

```html
<script src="https://cdn.convor.io/widget.js" data-key="convor_wpk_..." async></script>
```

The real key must come from the currently selected Convor website. If you copy
a placeholder from this README, the widget cannot initialize.

## Domains and privacy

- Add the live Sky-Shop storefront hostname to the website's allowed domains
  in Convor. Add both the technical test domain and the custom domain only if
  both are actively used. Do not enable arbitrary domains.
- The widget can send messages and track the current page. Embedding it does
  **not** automatically give Convor access to Sky-Shop customers, orders,
  passwords, or cart details. Do not paste private Sky-Shop or Convor tokens
  in the global code field.
- If your store requires cookie/third-party-script consent, arrange for your
  consent manager to control when the Convor script loads. A static global
  script loads immediately; Convor's widget settings alone do not turn a
  Sky-Shop custom-script field into a consent-gated loader. Test both accept
  and reject in a fresh visitor session. Update your privacy notice.
- The local browser, advertising blockers, content-security policies and
  Sky-Shop's own checkout restrictions can prevent display. Verify on the
  actual public domain, including mobile, before promoting the setup.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No launcher | Confirm Save, correct global HEAD field, browser network request for `https://cdn.convor.io/widget.js`, and extensions. Verify the public key, intended Convor website and allowed domain. |
| Launcher appears twice | Remove duplicate installs from GTM, theme integrations or another code field. One storefront should normally inject one Convor script. |
| Chat goes to the wrong inbox | Recheck which website is selected in Convor before copying the embed code. |
| Works in preview but not on storefront | Check actual published domain, cached pages, allowlist, CSP and cookie consent. |
| Checkout has no widget | Sky-Shop may isolate payment/checkout templates. Do not place the chat script in the finalization/conversion field to compensate. Document the limitation discovered in real testing. |
| Network errors | Inspect browser console and network statuses without exposing tokens in support screenshots. |

## Remove or move the installation

Delete **only** Convor's `<script ...widget.js ...>` tag from the global custom
code field and save, leaving unrelated scripts intact. Clear cache and verify
the storefront no longer requests Convor. Moving the shop to another domain
requires updating the allowed-domain list.

## Verified platform references

- [Sky-Shop: custom HTML/JavaScript/CSS](https://sky-shop.pl/pomoc-faq/integracje/wlasny-kod-i-api/jak-dodac-wlasny-kod-html-javascript-css/)
- [Sky-Shop: LiveChat dedicated field (comparison)](https://sky-shop.pl/pomoc-faq/konfiguracja/jak-dodac-widget-livechat-na-strone-sklepu/)
- [Smartsupp: Sky-Shop installation](https://help.smartsupp.com/en/articles/12647792-sky-shop)

This guide follows Sky-Shop's **public documentation**. Administrative labels
and live conversations still require verification on a real Sky-Shop account
before the release can be marked externally tested.
