# Convor Live Chat for PrestaShop

Add live chat to your storefront. Install the module with a Convor account and an active website in Convor. The widget appearance and inbox remain in Convor; no PrestaShop Webservice credentials are required.

## Compatibility and distribution

The module's declared range is PrestaShop 8.2.9–9.2.1. Real-store acceptance covers 8.2.9 (PHP 8.1, Classic), 9.0.3 (PHP 8.4, Classic), 9.1.5 and 9.2.1 (PHP 8.5, Hummingbird). Use a supported patched release; future versions require a compatibility retest. PrestaShop 1.6/1.7 is not supported by this module; use the manual embed if your storefront allows it and test it yourself. Production stores should use HTTPS. The module is source-available under the repository's MIT license. An official Marketplace listing is not yet available.

## Install and connect

1. Build the module from the repository root: `python3 scripts/build-prestashop.py`. The resulting `dist/prestashop/convor.zip` contains the required `convor/` directory. Do not extract the archive before uploading.
2. In PrestaShop, open **Modules → Module Manager → Upload a module**, select the ZIP, and then select **Configure**.
3. If multistore is enabled, select the individual shop to configure. Each shop has separate settings.
4. If your site requires prior opt-in, enable **Wait for consent before loading Convor** and integrate your consent manager before loading chat.
5. Select **Connect with Convor**, then **Open Convor**. Keep the administration tab open. Sign in to Convor, select the correct website, and confirm. On return, the original module tab completes the connection. If browser communication is blocked, copy the one-time connection code to the original tab and select **Finish connection**. The code expires; restart the connection if necessary.
6. Alternatively copy the public website widget key from **Integrations → PrestaShop** in Convor (starts with `convor_wpk_`) into **Public widget key**. Enable Convor and save. If verification is required, copy the optional `data-convor-verification` value from the Convor verification snippet into **Verification challenge (optional)**. Clear it after verifying.
7. Use **Open storefront to test chat** or open the shop in a private browser session, accept the applicable consent, send a message and reply from the Convor inbox. Check that the reply arrives at the storefront.

## Manual installation

Instead of the module, add the complete snippet copied from Convor to the active theme's shared header or layout. For example:

```html
<script src="https://cdn.convor.io/widget.js" data-key="convor_wpk_..." async></script>
```

Use a child theme or your developer's deployment process; clear the theme cache and verify that the snippet occurs exactly once. Do not weaken global HTML sanitization. Manual installations do not inherit the module's consent or checkout settings.

## Consent and checkout

The optional consent gate intentionally fails closed. Connect your existing CMP's current state and change callbacks to:

```js
window.convorPrestaShopConsent = true; // only when the applicable consent is granted
document.dispatchEvent(new Event("convor:prestashop-consent"));
```

On withdrawal set the value to `false` and dispatch the same event. The module aborts context requests, destroys the widget and reloads the page. Apply consent rules before any manual snippet, too. The bridge does not itself select a legal basis or replace a CMP.

**Hide chat during checkout** suppresses the widget on the checkout and order confirmation pages.

## Optional product and cart context

**Share product and cart context** sends the current product, variation, displayed price/currency and cart product subtotal/currency to the conversation through the widget API. It fetches current values from a same-origin, non-cacheable endpoint after consent and widget readiness; it does not put cart contents or customer details in cached page HTML. This is informational context, not an order integration or an authoritative quote. No order records, customer credentials, names or addresses are sent. The native commerce connector (catalog, orders and customer search) is a separate acceptance gate.

## Optional verified customer identity

Enable **Verify signed-in customers** only if you need to distinguish authenticated customer sessions. In the selected Convor website's widget settings, open **Verified customer identity** and generate a signing secret. Copy it into **Identity verification secret** in the PrestaShop module and save. The module encrypts the secret locally; the password field remains blank on subsequent visits. Leaving it blank preserves the existing secret for the same widget key. When rotating the secret, copy the new value immediately. Never use it in theme snippets or frontend code.

The feature requires a Convor SDK build supporting managed visitor sessions. It obtains a scoped credential from the storefront after consent, sends a signed pseudonymous identifier scoped to the current authenticated visitor session, and separates guest and customer login sessions. A new login, independent browser session or signing-secret rotation receives a distinct visitor identity rather than reusing earlier chat history. It does not send the customer's name, email, address or orders. If the secret or SDK is unavailable, identity-enabled chat does not fall back to a shared browser identity. Disable the identity option if you need ordinary anonymous chat. This feature is off by default and must pass real-store identity acceptance tests before release.

## Troubleshooting

- Confirm that the key belongs to the selected active Convor website, and the exact storefront origin is allowed in Convor.
- Clear PrestaShop's cache after changing theme or module configuration.
- Check consent manager state, browser content blockers and CSP. Permit the documented Convor endpoints without disabling CSP globally.
- Remove duplicate installations (theme, tag manager, module). The module forwards context only to a compatible SDK bound to this exact website and, for verified identity, its current managed session. If an independent script changes the active widget, context sharing stops; use one installation method.
- If a connection expires, return to the module and restart; manual key entry remains available.
- Do not use your organization slug or a private API key.

## Upgrade and removal

Upgrading 1.0.0 preserves a valid public widget key in the appropriate shop. An old organization slug requires reconnection. The merchant-editable CDN override has been removed. Disabling the module keeps its configuration. Uninstalling deletes Convor settings; remove separate theme or tag-manager snippets yourself. Reinstall from a tested archive if rollback is needed.

## Developer QA

See `integration-tests/fixtures/prestashop/` for the real platform test, and `integration-tests/prestashop.test.js` for the isolated module behavior contract. Production uses the canonical Convor HTTPS endpoints. The explicit `CONVOR_PRESTASHOP_LOCAL_QA` flag permits only the isolated fixture origins; invalid overrides fail closed rather than falling back to production. Test the same built ZIP that will be distributed.
