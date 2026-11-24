# Marketplace submission — release candidate

Status: PREPARED (not submitted or approved). Do not claim an official listing.
Owner approval required for PrestaShop partner/seller registration, fees,
Marketplace licence terms and use of the issued module_key. The current
distribution remains MIT; do not replace its licence without authorization.
Register external service accounts with integrations@convor.io (owner directive).
Reviewer PDFs are stored in `prestashop-marketplace/` outside the module ZIP;
regenerate them from the actual EN/PL website guides with
`integration-tests/fixtures/prestashop/export-guide-pdfs.mjs`.

## EN listing draft
**Name:** Convor Live Chat: Customer Support and Messaging

**Short description:** Add live chat to your store with Convor. Connect your
website, answer customer messages in one inbox and optionally share the
current product and cart subtotal.

**Merchant benefits:** Connect a Convor website without supplying REST API
credentials. Use one inbox to reply to storefront conversations. Configure the
widget in Convor and choose whether to hide it during checkout. Optionally
share product and cart context and enable signed-in customer verification.
The module does not synchronize orders.

**Customer benefits:** Ask questions without leaving the store. Receive replies
directly in the chat window.

**Keywords:** live chat, customer support, messaging, shared inbox, ecommerce,
cart context.

## PL listing draft
**Nazwa:** Convor Live Chat: Customer Support and Messaging

**Krótki opis:** Dodaj czat do sklepu z Convor. Połącz witrynę, odpowiadaj na
wiadomości klientów w jednej skrzynce i opcjonalnie udostępniaj kontekst
produktu oraz wartość produktów w koszyku.

**Korzyści dla sprzedawcy:** Połącz witrynę bez podawania kluczy REST API sklepu.
Obsługuj rozmowy w skrzynce Convor. Zmieniaj wygląd widżetu w Convor, ukrywaj
czat podczas składania zamówienia i opcjonalnie przekazuj kontekst produktu i
koszyka oraz włączyć weryfikację zalogowanych klientów. Moduł nie
synchronizuje zamówień.

**Korzyści dla klienta:** Zadawaj pytania bez opuszczania sklepu. Otrzymuj
odpowiedzi bezpośrednio w oknie czatu.

**Słowa kluczowe:** czat na żywo, obsługa klienta, wiadomości, skrzynka
odbiorcza, sklep internetowy, koszyk.

## Review and release checklist
- Category: Support & Online Chat. Free module; Convor account required,
  optional SaaS features depend on plan. Confirm partner terms before submission.
- Build the tested direct archive with `python3 scripts/build-prestashop.py`.
  For Marketplace only, run `python3 scripts/build-prestashop-marketplace.py --guides prestashop-marketplace/seller-guides`.
  This emits a separate keyless preflight archive. Once the seller portal issues
  the actual module_key, pass `--module-key-file` and retest the resulting archive.
  Never upload the keyless candidate or overwrite the verified direct download.
- Validate the production package using the official Marketplace validator.
  Save the report and address its findings. Obtain the module_key through the
  authenticated seller portal and rebuild/retest if required.
- Use the real screenshots from the final QA shop (at least three per
  supported listing language, no credentials, synthetic data, no watermark).
  Source icon: existing Convor brand artwork in logo.png (256×256).
- Attach the Marketplace-specific `readme_en.pdf` and `readme_pl.pdf`.
  Both are also included in the Marketplace envelope under `docs/`.
  Only document supported, actually tested versions and features.
- Reviewer: upload ZIP through Module Manager, configure with a synthetic
  Convor account, connect an authorized website, open storefront, send a
  message and reply from the inbox; also test manual theme installation.
- Provide a least-privilege, isolated reviewer account. No real customer data
  or production credentials. Supply support/privacy/DPA links as required by
  the seller portal and actual terms.
- Test upgrade from 1.0.0, disable, uninstall, reinstallation, multistore and
  consent before approving the release. Test the current PrestaShop release.
- Update the compatibility statement to match verified PS/PHP versions.
- After authorization, upload and record submission ID, technical and
  marketing review status, and eventual approved listing URL in #1807.
- After approval, download the Marketplace artifact in the merchant flow and
  verify package identity and real chat. Only then set PUBLIC_VERIFIED.
- Rollback: preserve previous tested ZIP and checksum. Disable module without
  changing storefront functionality; uninstall or revert to the previously
  tested package if appropriate. Do not roll back by exposing unsafe org slugs.
- Maintain direct download and versioned release artifacts from the same build
  source, support ownership and release notes. Monitor artifact availability
  and retest new supported PS/PHP releases.
