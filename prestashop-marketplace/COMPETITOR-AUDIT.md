# Competitor verification — PrestaShop (#1807)

24 November 2026. The primary audit in Convor-IO/Convor #1807 compares Smartsupp, tawk.to, Crisp and Tidio using their official installation documentation. This supplements the documentation with inspected release code and a real installation. It does not claim that we have signed in to the other vendors' services.

## tawk.to — independently inspected release

Official sources: https://github.com/tawk/tawk-prestashop/releases/tag/1.6.0 and https://help.tawk.to/article/adding-the-tawkto-widget-to-prestashop-9x

- Public release 1.6.0, published 19 January 2026. Downloaded the official PS9 ZIP, SHA-256 `707ad52cc5db90001d9aa6720da40e97bcd0b6de5ac3c07785d3d4e67d52f8b5`, verified against GitHub's release asset digest. Its license file identifies OSL 3.0. The vendor provides distinct packages for 1.7, 8 and 9; this is not a claim of support for every minor/PHP combination.
- Real PrestaShop 9.2.1 installation in a disposable Compose project with no Convor network, data or credentials. Headless Chromium uploaded the vendor ZIP in Module Manager, confirmed installation, followed Configure, and verified the dedicated admin controller and iframe source at plugins.tawk.to. The external iframe was blocked locally: no vendor credentials, account creation, service calls from the browser, or paid operations. A separate real storefront request verified no widget before configuration. Native CLI uninstall succeeded and removed the dedicated admin tab. Initial internally isolated bootstrap could not download the platform's language pack; the fresh fixture used its own standard Docker network to bootstrap. No third-party code was copied into Convor.
- Source observations: the module registers the footer hook, saves a selected property/widget pair in platform configuration, and uses its remote iframe for account/widget selection. It accepts page visibility options, including product/category/home types and URL pattern lists; it renders customer name/email in the storefront script when recognition is enabled, with recognition enabled by default in the code. These are observations of the distributed source, not a security audit or a claim about all hosted behavior.

## Implications for Convor

| Aspect | Current Convor candidate | Decision / remaining gap |
|---|---|---|
| Installation | Actual Module Manager ZIP plus manual theme embed; current website key, optional verification challenge | Keep one immutable package with explicit compatibility tests. Marketplace approval remains separate. |
| Account selection | Top-level authenticated Convor dashboard, one-time grant, tenant/project binding, native MFA and manual fallback | Do not put account credentials into a PrestaShop form or recreate a vendor login iframe. External OAuth and public HTTPS still require authorized QA. |
| Recognition | Optional server-signed session-scoped pseudonym, no names/email/order data in HTML | Keep privacy-preserving opt-in and revocation. Do not imitate the vendor's direct name/email rendering. Independent native commerce order access needs its own authorized ownership contract. |
| Visibility | Checkout and order-confirmation exclusion; optional consent gate | tawk.to additionally offers arbitrary URL/path and page-type rules. The agreed local scope covers checkout; general rules remain a product-level gap. Prefer a shared widget visibility policy across integrations instead of duplicating rule editors in individual plugins without a common product decision. |
| Commerce context | Real product/variant/currency/cart context; no order writes | Keep native catalog sync and private order data behind #1802/#1785, not a widget-install entitlement. |
| Distribution | Local tested ZIP, bilingual real screenshots and PDFs | Official seller eligibility, licensing, validator, review, public listing, public smoke and contractual support are not yet approved or completed. |

The exact installed Convor candidate is tested on four real PrestaShop versions. The additional competitor installation verifies its local install/configure behavior, not a full tawk.to conversation or the external account linking flow.
