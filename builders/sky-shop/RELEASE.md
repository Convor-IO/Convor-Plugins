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

Temat: Convor — propozycja integracji live chat z Sky-Shop i sklep testowy

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
3. Czy możemy uzyskać dostęp do sklepu testowego na czas integracji i testów
   E2E, najlepiej w trybie partnerskim?
4. Czy istnieje opłata, umowa partnerska lub proces przeglądu aplikacji?

Możemy dostarczyć polsko- i anglojęzyczną instrukcję oraz pełne wyniki testów
instalacji i rozmowy z naszym systemem. Chętnie uzgodnimy najbardziej
przyjazny proces instalacji dla użytkowników Sky-Shop.

Zespół Convor
https://convor.io

**Send only after verifying live URLs, the appropriate sender identity and
company details.** Do not send the inquiry from an unrelated personal account.

## Real-world QA ledger

Use a real Sky-Shop merchant test account and synthetic customer and order data.
Record only public test URLs and redacted evidence in
[Convor #1809](https://github.com/Convor-IO/Convor/issues/1809). Keep credentials
in the vault. Save status codes and console events with keys, tokens and
customer data removed.

The trial and administrator access were established on 2026-11-24. Record
PASS or FAIL and observed evidence for each storefront case when it runs.

| Date | Case | Result and evidence |
| --- | --- | --- |
| 2026-11-24 | Technical hostname installation | PASS. Copied the production site's generated snippet. Sky-Shop returned 200 on Save and reopening the global HEAD editor showed the exact snippet. The published storefront contained one loader. |
| 2026-11-24 | Home, category and product × desktop and mobile | PASS for installation and public configuration, 6/6. At 1440 and 390 px all three real page types returned 200, loaded one CDN script and received HTTP 200 from the widget configuration endpoint. No CSP response header was present on these pages. |
| 2026-11-24 | Storefront search | PASS for script placement. Submitting the search form opened the storefront's `/category/` route with one Convor loader. Chat interaction on the results page is pending. |
| 2026-11-24 | Invalid public key | PASS in a separate browser session on the live storefront. Substituting a synthetic invalid key in that browser prevented the widget iframe from mounting. The shop settings were untouched. |
| 2026-11-24 | Domain restriction | PASS. Before switching policies, a browser on a Convor-owned HTTPS hostname outside the QA site's list received HTTP 200. After saving Only listed domains and reloading the dashboard, the same browser received HTTP 403 and the real Sky-Shop hostname continued to receive HTTP 200. |
| 2026-11-24 | Cart entry | BLOCKED. Available sample product controls did not yield an actionable add-to-cart path in the browser. No order was placed. |
| 2026-11-24 | Block the CDN loader in the shopper browser | PASS. The storefront and product link remained available, with no Convor iframe after the script was blocked. |
| 2026-11-24 | Two-way conversation in automated Chromium | BLOCKED. Convor's tracking endpoint returned HTTP 200 with an automated-client rejection. The host received `api-unavailable` after `iframe-ready`. The test requires a shopper in a regular browser. |
| 2026-11-24 | Contact data in the trial storefront | PASS after clearing the public phone fields in shop data and Schema settings. Independent browser requests to Home and Contact returned 200 without the submitted number in HTML. |
| 2026-11-24 | Uninstall and restore on the technical hostname | PASS for removal. Saved the empty global HEAD field and a cache-busted storefront request returned HTTP 200 with no Convor loader. Reapplied the original site snippet. Sky-Shop confirmed `{"success":true}` and separate public requests to Home, Category and Product showed one loader each. |
| 2026-11-24 | Actual administrator screen | PASS. Checked the Polish `Integracje → Własny kod JavaScript/HTML/CSS → W nagłówku <HEAD>` path and verified the redacted screenshot and zoom in both localized guides. |

The remaining storefront cases below still require recorded outcomes.

| Case | Evidence to collect |
| --- | --- |
| Client message and operator reply | Real request statuses, message in the selected Convor inbox, reply delivered to the storefront |
| Reload and separate visitor | First visitor retains their conversation after refresh; second visitor sees only their own session |
| Homepage, category, product, search and cart | A separate URL and result for every page, including interaction with the launcher |
| Checkout and confirmation | Page-by-page result on a test order, including any platform restrictions and interference with payment controls |
| Desktop, mobile and two themes | Captures and interaction checks per theme and viewport |
| Custom hostname and domain change | Correct allowed-domain behavior on both hostnames and the same conversation flow on the custom domain |
| Consent, refusal and revocation | Fresh-session network traces and CMP configuration for all three paths |
| Inactive site | Widget fails safely, with no private site or visitor data in the response |
| CSP, unavailable CDN and script blockers | Browser diagnostics and a working storefront when the widget cannot load |
| GTM conflict and duplicate embed | Observable request and launcher counts before and after keeping one installation method |
| Customer and order data | Synthetic storefront order and no customer/order credential or record sent by the embed |
| Guide and screenshots | Compare the exact panel labels with PL/EN docs and capture the required real storefront and inbox states |

Record the operator's formal submission reference after sending the reviewed
QA package. Verify a public catalog URL before marking the listing published.
