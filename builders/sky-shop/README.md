# Convor live chat on Sky-Shop

Install Convor through Sky-Shop's global **custom JavaScript/HTML** field. The
widget uses your Convor website's public key. An official directory listing
requires Sky-Shop's approval.

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

- In Convor, go to **Sites**, select your website and open **Widget and
  domains**. Add the live Sky-Shop storefront hostname, select **Only listed
  domains** and save the policy. Include the technical hostname if it is
  still in use.
- The widget can send messages and track the current page. Embedding it does
  **not** automatically give Convor access to Sky-Shop customers, orders,
  passwords, or cart details. Do not paste private Sky-Shop or Convor tokens
  in the global code field.
- A direct embed loads when the page opens. If your store requires consent to
  load chat, use the Sky-Shop popup setup below or connect your own consent
  manager. Update your privacy notice.
- The local browser, advertising blockers, content-security policies and
  Sky-Shop's own checkout restrictions can prevent display. Verify on the
  actual public domain, including mobile, before promoting the setup.

## Use the Sky-Shop cookie popup

1. In Sky-Shop, enable the popup under **Konfiguracja → Ustawienia sklepu →
   Informacja o cookies**.
2. Open [the consent snippet](./consent-snippet.html). Replace
   `YOUR_WIDGET_KEY` with your site's public `convor_wpk_` key. If the code
   copied from Convor contains `data-convor-verification`, keep it on the
   same tag as `data-key`.
3. Set `data-convor-sky-shop-category` to the popup category you use for Convor.
   `analytics` corresponds to **Statystyczne** and `marketing` to
   **Marketingowe**.
4. Replace the direct Convor embed in **W nagłówku &lt;HEAD&gt;** with both tags
   from the snippet. Leave the other scripts in place and save.
5. Open the store in a private window. Refuse consent and check that Convor
   stays hidden. Then grant consent, open the chat, and withdraw consent in
   **Zgody cookies**. The chat closes in the current tab. Grant consent again
   to confirm that the chat returns.

This snippet reads the choice saved by the Sky-Shop popup on the current
domain. It checks for updates while the page is open and when a tab becomes
visible. If you use a different consent manager, connect its acceptance and
withdrawal callbacks to the widget instead.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No launcher | Confirm Save, correct global HEAD field, browser network request for `https://cdn.convor.io/widget.js`, and extensions. Verify the public key, intended Convor website and allowed domain. |
| Launcher appears twice | Keep one copy of the Convor script in the global HEAD field. |
| Chat goes to the wrong inbox | Recheck which website is selected in Convor before copying the embed code. |
| Works in preview but not on storefront | Check actual published domain, cached pages, allowlist, CSP and cookie consent. |
| Checkout has no widget | Sky-Shop may isolate payment/checkout templates. Do not place the chat script in the finalization/conversion field to compensate. Document the limitation discovered in real testing. |
| Network errors | Inspect browser console and network statuses without exposing tokens in support screenshots. |

## Remove or move the installation

Delete the Convor tag from the global code field. If you used the cookie popup
snippet, delete both of its script tags. Save and verify in a fresh storefront
session that the browser no longer requests Convor. Update the allowed-domain
list if you move the shop to another domain.

## Verified platform references

- [Sky-Shop: custom HTML/JavaScript/CSS](https://sky-shop.pl/pomoc-faq/integracje/wlasny-kod-i-api/jak-dodac-wlasny-kod-html-javascript-css/)
- [Sky-Shop: cookie popup settings](https://sky-shop.pl/pomoc-faq/konfiguracja/ustawienia-sklepu/jak-zarzadzac-informacja-o-plikach-cookies-w-sklepie/)
- [Sky-Shop: LiveChat dedicated field (comparison)](https://sky-shop.pl/pomoc-faq/konfiguracja/jak-dodac-widget-livechat-na-strone-sklepu/)
- [Smartsupp: Sky-Shop installation](https://help.smartsupp.com/en/articles/12647792-sky-shop)

The installation steps and chat exchange were verified on a published Sky-Shop
trial. See the [QA ledger](./RELEASE.md#real-world-qa-ledger) for coverage and
release status.
