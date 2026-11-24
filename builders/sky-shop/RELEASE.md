# Sky-Shop launch and partner handoff

Convor uses Sky-Shop's global script field for manual installation. Sky-Shop
owns the directory and any native installation screen. Verify directory status
against the operator's response and the public catalog.

## Operator contact and access

| Date | Action | Observed result |
| --- | --- | --- |
| 2026-11-24 | Sign in with the credentials from the earlier trial attempt | HTTP 401. The sign-in message covers both an unknown email and an incorrect password. |
| 2026-11-24 | Submit one free-trial request as `integrations@convor.io` | The registration UI sent `POST /order/` and received HTTP 302 with an HTML content type. The client reported a JSON parse error. The reason for the redirect is unconfirmed. |
| 2026-11-24 | Sign in with the new trial credentials and check the integrations mailbox | HTTP 401 and no Sky-Shop activation message in Inbox or Junk at the time of the check. No administrator access. The credential is in Vaultwarden. |
| 2026-11-24 | Ask the operator to check account provisioning, provide an admin QA store, and explain directory requirements | Email accepted by the sending mail server. Message ID `sky-shop-convor-1809-20261124@convor.io`. Sky-Shop acknowledged receipt at 12:37 CET and forwarded the message to the responsible team. Awaiting a substantive response. No ticket number was provided. |
| 2026-11-24 | Account owner completed registration on the second attempt | Trial provisioned at `pv333.mysky-shop.pl` through 2026-12-08. Confirmed public HTTP 200 and administrator sign-in with the Vaultwarden credential. |
| 2026-11-24 | Complete the administrator profile and prepare Convor | Sky-Shop accepted the business details with the free trial selected. Verified the separate production Convor QA account and initialized the `Convor Sky-Shop QA` site with the technical hostname as its only configured domain. The policy was subsequently switched from Allow all origins to Only listed domains. |

Sky-Shop documents [a free trial and a partner test store](https://sky-shop.pl/program-partnerski/).
The [public catalog](https://sky-shop.pl/integracje-pozostale/) lists live-chat
integrations such as [SmartSupp](https://sky-shop.pl/integracja-z-smartsupp/).
Convor's formal listing submission follows storefront QA. Sky-Shop has yet to
confirm the required materials, fees, agreement, review schedule, or support
for a dedicated public-key field. See [Convor #1809](https://github.com/Convor-IO/Convor/issues/1809)
for the contact history.

On 2026-11-24 the public catalog still had no Convor entry. The public partner
application covers referrals and reseller benefits. The operator has not confirmed
a submission form for software vendors or any fees, contract, required materials,
technical review, turnaround time, or dedicated Convor field. An initial inquiry
was acknowledged. The trial is already available and further correspondence is
handled by the account owner.

## Submission package for Sky-Shop

**Name (PL):** Convor – czat na żywo dla Sky-Shop

**Category:** Marketing / komunikacja / obsługa klienta

**Short description (PL):**
> Czat na żywo Convor umożliwia kontakt z klientami sklepu Sky-Shop bezpośrednio
> z poziomu strony. Zainstalujesz go przez wklejenie jednego kodu JavaScript
> w globalnych ustawieniach sklepu. Wiadomości obsłużysz w panelu Convor.
> Sama instalacja nie wymaga klucza WebAPI Sky-Shop ani nie daje dostępu do
> zamówień lub danych klientów.

**Name (EN):** Convor Live Chat for Sky-Shop

**Short description (EN):**
> Add Convor live chat to your Sky-Shop storefront through the built-in global
> JavaScript field. Receive and reply to conversations in your Convor inbox.
> No Sky-Shop WebAPI credentials or access to private orders is required.

**Installation mode:** manual global embed, unless Sky-Shop approves a
first-party native key field. Do **not** claim OAuth, store data sync, order
lookup, conversion analytics, a native app, or one-click install.

**Website pages, once deployed:**
- English landing: `https://convor.io/en/integrations/sky-shop`
- Polish landing: `https://convor.io/pl/integrations/sky-shop`
- English guide: `https://convor.io/en/docs/integrations/sky-shop-integration`
- Polish guide: `https://convor.io/pl/docs/integrations/sky-shop-integration`
- Support/legal: validate the live Convor contact, pricing, privacy and ToS
  URLs immediately before submitting.

**Source files:** `builders/sky-shop/README.md`, `snippet.html` and
Convor-Website `content/docs/integrations/sky-shop-integration*.mdx`.

## Suggested partner inquiry (PL)

Temat: Convor w katalogu integracji Sky-Shop

Dzień dobry,

rozwijamy Convor, narzędzie do obsługi rozmów z klientami sklepów internetowych.
Przygotowaliśmy integrację czatu ze Sky-Shop za pomocą globalnego pola
Integracje → Własny kod JavaScript/HTML/CSS, bez przekazywania kluczy WebAPI
i bez dostępu do prywatnych zamówień. Chcielibyśmy doprowadzić tę integrację
do oficjalnej dostępności dla klientów Sky-Shop.

Prosimy o informację:
1. Jaka jest procedura dodania Convor do oficjalnego katalogu integracji?
   Czy jest możliwy natywny ekran z publicznym kluczem witryny zamiast ręcznego
   wklejania JavaScript?
2. Jakie są wymagania dotyczące testów, dokumentacji, bezpieczeństwa,
   oznaczeń graficznych, cen i zgód na użycie logo Sky-Shop?
3. Testujemy czat na aktywnym sklepie próbnym. Czy na potrzeby odbioru
   i utrzymania integracji udostępniacie długoterminowy sklep testowy?
4. Czy istnieje opłata, umowa partnerska lub proces przeglądu aplikacji?

Możemy dostarczyć polsko- i anglojęzyczną instrukcję oraz pełne wyniki testów
instalacji i rozmowy z naszym systemem. Chętnie uzgodnimy najbardziej
przyjazny proces instalacji dla użytkowników Sky-Shop.

Zespół Convor
https://convor.io

**Send only after verifying live URLs, the appropriate sender identity and
company details.** Do not send the inquiry from an unrelated personal account.

## Real-world QA ledger

Use a real Sky-Shop merchant test account and synthetic shopper messages.
Record only public test URLs and redacted evidence in
[Convor #1809](https://github.com/Convor-IO/Convor/issues/1809). Keep credentials
in the vault. Save status codes and console events with keys, tokens and
customer data removed.

The trial and administrator access were established on 2026-11-24. Record
PASS or FAIL and observed evidence for each storefront case when it runs.

| Date | Case | Result and evidence |
| --- | --- | --- |
| 2026-11-24 | Technical hostname installation | PASS. Copied the production site's generated snippet. Sky-Shop returned 200 on Save and reopening the global HEAD editor showed the exact snippet. The published storefront contained one loader. |
| 2026-11-24 | Home, category and product × desktop and mobile | PASS for installation and public configuration, 6/6. At 1440 and 390 px all three real page types returned 200, loaded one CDN script and received HTTP 200 from the widget configuration endpoint. The launcher opened and closed the chat input on Home in the conversation test and on Category and Product at both widths in regular Chrome. No CSP response header was present. |
| 2026-11-24 | Storefront search | PASS. Searching for a sample product opened `/category/` with one loader and one chat frame. In regular Chrome the launcher opened the message field and closed the chat. |
| 2026-11-24 | Invalid public key | PASS in a separate browser session on the live storefront. Substituting a synthetic invalid key in that browser prevented the widget iframe from mounting. The shop settings were untouched. |
| 2026-11-24 | Domain restriction | PASS. Before switching policies, a browser on a Convor-owned HTTPS hostname outside the QA site's list received HTTP 200. After saving Only listed domains and reloading the dashboard, the same browser received HTTP 403 and the real Sky-Shop hostname continued to receive HTTP 200. |
| 2026-11-24 | Cart with a sample product | PASS. Added the sample backpack to the cart and verified its row at `/cart/`. The page loaded one Convor script and the launcher opened and closed the message field. |
| 2026-11-24 | Checkout entry | PASS for chat availability on `/order`. Used the cart's Przejdź do kasy action and opened and closed the chat. The browser did not submit an order or start a payment. |
| 2026-11-24 | Request audit with a sample cart | PASS within the browsing scope. Inspected URL parameter names and structured POST field names for Convor API and CDN requests on product, cart and checkout entry. Across 19 distinct paths, none matched the tested Sky-Shop customer, order, address, cart or payment field names. This check used an unsigned shopper with an empty checkout form. |
| 2026-11-24 | Block the CDN loader in the shopper browser | PASS. The storefront and product link remained available, with no Convor iframe after the script was blocked. |
| 2026-11-24 | Restrictive CSP in the shopper browser | PASS for graceful failure. Added `script-src 'self' 'unsafe-inline'` to the real shop's response in an isolated browser. Chrome blocked the Convor CDN script. The storefront returned HTTP 200, a product link remained visible, and no Convor frame mounted. |
| 2026-11-24 | Platform announcement banner on Sky-Shop | FAIL in production. The storefront's request to `GET /api/banner` returned HTTP 200 without `Access-Control-Allow-Origin` and the browser rejected it. The widget config and visitor token each returned HTTP 200 with the expected origin. A route-only Convor Server fix passed 30 maintenance and CORS tests locally. The production endpoint still needs deployment and a new browser check. |
| 2026-11-24 | Two-way conversation in automated Chromium | BLOCKED. Convor's tracking endpoint returned HTTP 200 with an automated-client rejection. The host received `api-unavailable` after `iframe-ready`. This result applies to automated Chromium. The regular Chrome run below used the live shopper flow. |
| 2026-11-24 | Live two-way conversation, refresh and session isolation | PASS in regular Chrome on the published trial. The shopper message and operator reply both returned HTTP 201 from the live backend. The shopper received the reply and both messages persisted after refresh. A second browser context opened an independent conversation without either message. The same thread was visible at a 390 px mobile viewport. |
| 2026-11-24 | Native Sky-Shop consent refusal with direct HEAD embed | FAIL for installations that require opt-in. The loader was present before consent. After clicking Wyłącz wszystkie in a fresh session, the loader and chat launcher remained active. Configure and verify consent gating separately when it is required. |
| 2026-11-24 | Native opt-in on the published shop | PASS for initial refusal and acceptance. Temporarily saved `type="text/plain" data-cookiecategory="analytics"` on the snippet in the real HEAD editor. The public page made zero Convor requests before consent and after refusing and reloading. Accepting the category loaded Convor with a live HTTP 200 visitor token and the chat input opened. Restored the original QA snippet after the test. |
| 2026-11-24 | Native withdrawal on an already open page | FAIL for immediate iframe removal. After saving required-only preferences, the original document still had one Convor frame. A newly loaded page made zero Convor requests and had no launcher. A consent manager must unload the widget or reload the page for immediate withdrawal. |
| 2026-11-24 | Opt-in, withdrawal and reacceptance with `consent-snippet.html` | PASS in regular Chrome on the published shop. The inert declaration and controller were saved in the real HEAD editor and verified in the public response. No Convor requests before consent or after refusal and reload. Accepting the selected category opened chat. Saving required-only preferences removed the open iframe and launcher from the same document within the 2.4-second assertion window. No Convor requests followed during the 1.1-second observation. Reaccepting reopened one chat with one loader request for that document. A second withdrawal and fresh page again left chat absent. |
| 2026-11-24 | Consent widget ownership on the published shop | PASS after a regression fix. An isolated Chrome session started a managed instance through the production tag installer. The earlier Sky-Shop snippet replaced the active iframe when the Sky-Shop popup granted consent. The updated snippet leaves that same iframe mounted during native grant and withdrawal. Withdrawing the managed installation removed its own instance. The native-only consent lifecycle also passed after saving the updated snippet. |
| 2026-11-24 | Conflict with an independent GTM tag | PASS in Google Tag Assistant preview on the published shop. A dedicated QA workspace served its draft Custom HTML tag through Google's `gtm.js` preview response (HTTP 200). In the isolated visitor session, the tag mounted one production Convor frame. Native Sky-Shop grant and withdrawal preserved that same frame. The tag's own withdrawal removed it. The GTM bootstrap was scoped to the QA browser and the draft was left unpublished. |
| 2026-11-24 | Stored consent across browser engines | PASS in Firefox 155.0 and WebKit 26.6 on the published shop. Set the Sky-Shop consent cookie in each isolated browser to exercise stored choices. No Convor requests before consent or after refusal. The initial grant mounted chat, withdrawal removed it and regrant mounted it without a second loader request. This run exercised the saved choice. The Chrome run above covers the popup controls. |
| 2026-11-24 | Live conversation with the consent snippet | PASS. The shopper and operator each sent a message through the real backend with HTTP 201. The reply was visible in the shopper's chat and both messages returned after reload. An independent 390 px mobile visitor declined without Convor requests, then accepted and opened an empty chat. |
| 2026-11-24 | Browser content-blocking extension | PASS. Chromium loaded an isolated Manifest V3 blocker on the trial. The consented loader request failed with `ERR_BLOCKED_BY_CLIENT`, no chat frame mounted, and the homepage and linked product page returned HTTP 200. |
| 2026-11-24 | Duplicate embed | PASS for widget deduplication. Repeated the same script in an isolated browser response for the real shop. Two script tags yielded one iframe and one configuration request. The launcher opened and closed the chat. |
| 2026-11-24 | Contact data in the trial storefront | PASS after clearing the public phone fields in shop data and Schema settings. Independent browser requests to Home and Contact returned 200 without the submitted number in HTML. |
| 2026-11-24 | Uninstall and restore on the technical hostname | PASS for removal. Saved the empty global HEAD field and a cache-busted storefront request returned HTTP 200 with no Convor loader. Reapplied the original site snippet. Sky-Shop confirmed `{"success":true}` and separate public requests to Home, Category and Product showed one loader each. |
| 2026-11-24 | Uninstall and restore the consent snippet | PASS. Saving the empty field removed both tags from the published shop. Recovered the current site's embed code from Convor and reapplied the same consent snippet. The exact save returned HTTP 200 and the independent storefront response contained the consent configuration again. The trial uses this configuration. |
| 2026-11-24 | Actual administrator screen | PASS. Checked the Polish `Integracje → Własny kod JavaScript/HTML/CSS → W nagłówku <HEAD>` path and verified the redacted screenshot and zoom in both localized guides. |

Open cases and coverage limits.

| Case | Evidence to collect |
| --- | --- |
| Post-order confirmation | Requires a completed Sky-Shop test order. The current QA stops at checkout entry. |
| Alternate theme | The store uses Flex. The other themes exposed by the trial's theme creator show Kup i aktywuj. Preview uses example content and cannot establish compatibility on the published shop. |
| Custom hostname and domain change | Blocked by the account portal. It lists pv333 as a trial through 2026-12-08. Its domain requests return HTTP 404 and Add domain opens a message saying there is no active store on the account. No DNS records were changed. |
| Inactive site | Widget fails safely, with no private site or visitor data in the response |
| Customer and order data | Normal browsing and checkout entry are covered. A completed order was outside the tested request audit. |
| Guide and screenshots | Save evidence of the remaining storefront and configuration cases alongside the live conversation captures. |

Record the operator's formal submission reference after sending the reviewed
QA package. Verify a public catalog URL before marking the listing published.
