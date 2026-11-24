# Sky-Shop launch and partner handoff

This is **not** evidence of a native Sky-Shop app being published. Convor's
existing browser widget is installed through Sky-Shop's global script field.
Sky-Shop's official directory and any native install UI are controlled by
Sky-Shop. Keep the marketplace submission status as **unsubmitted** until
a platform ticket or written response exists.

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
Integracje → Własny kod JavaScript/HTML, bez przekazywania kluczy WebAPI
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

Use exactly one actual Sky-Shop merchant account. Record only a non-sensitive
test domain; put passwords in the team vault. Enter observed results into issue
[Convor #1809](https://github.com/Convor-IO/Convor/issues/1809).

| Case | Expected | Evidence to attach |
| --- | --- | --- |
| New installation on technical hostname | Exactly one Convor script, real two-way conversation in selected site | Redacted Network/Console and storefront/inbox screenshot |
| Custom shop hostname | Allowed domain, same result after domain switch | Config and network statuses, no keys |
| Storefront pages | Homepage, category, product, search, cart, checkout and thank-you tested individually | Actual URLs and PASS/FAIL; disclose Sky-Shop script restrictions |
| Desktop/mobile and themes | Launcher usable without blocking payment controls | Redacted 1440px and 390px screenshots across 2 themes |
| Consent | No remote widget load on refusal, loads after permitted opt-in | Fresh-session network trace and CMP configuration |
| Wrong key, blocked domain, network down | Safe failure and no customer data leakage | Negative assertions/network |
| Duplicate GTM embed | Merchant informed to remove one installation; one final launcher | Script count |
| Removal | Only Convor script removed, no requests after clearing cache | Public storefront network proof |

**Owner approval or a working Sky-Shop trial/partner shop is required for the
external QA and listing**. Code and local screenshot unit tests cannot replace
those checks. Only tick submission/published after Sky-Shop returns a ticket or
public listing URL, respectively. Do not infer publication from an outgoing
message alone.
