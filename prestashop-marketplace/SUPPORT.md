# PrestaShop support and release operations

## Routing

- Marketplace cases: answer through the actual Seller Portal once the listing
  exists; use integrations@convor.io for account administration.
- Ordinary Convor installation and chat support: support@convor.io, as already
  published by Convor. Privacy requests: privacy@convor.io. Do not redirect
  Marketplace buyers away from required Marketplace support channels.
- Contractual response targets and staffing are set by the authorized owner
  against the actual Marketplace agreement. The current document does not
  make a new SLA or guarantee on their behalf.

## Triage

| Symptom | First check | Priority |
|---|---|---|
| Checkout broken or storefront unavailable | Disable the Convor module, repeat with the original storefront, record the exact PS/PHP/theme/module versions | Release blocker |
| Wrong customer's messages or cross-site context | Stop the affected integration; preserve minimal redacted reproduction; notify engineering/security immediately | Release blocker |
| Widget absent | Verify enabled setting, correct selected website, exact domain, consent, CSP and network; inspect actual widget activity | Installation |
| Pairing fails | Check merchant admin context, authenticated Convor account, selected website and original browser tab; restart pairing if code expired | Installation |
| No messages or replies | Real synthetic message from storefront, find it in the correct inbox, send an operator reply and verify receipt | Runtime |
| Update or upload fails | Verify the immutable ZIP/checksum, PS/PHP versions and exact installed archive members | Distribution |

Ask for PS version, PHP version, module version, theme, installation method,
affected page type, whether consent is required, sanitized HTTP status/error
code and minimal reproduction. Do not request private API keys, signing
secrets, admin passwords, pairing codes, raw customer data or session IDs.
Do not attach unsanitized logs, cookies, request bodies or traces. Use the
GitHub PrestaShop issue template for sanitized engineering triage; use the
private support channel for sensitive incident handling.

## Monitoring

The local demo is available through a named Cloudflare Tunnel while the owner
keeps the local computer and tunnel running; it is not a production uptime
SLA. Run `bash integration-tests/fixtures/prestashop/check-public-qa.sh` to
verify TLS, homepage, noindex/no-store, protected admin and blocked private
paths. Run the real public proof fixture with a fresh synthetic tenant when
releasing a new version. The test does not keep a live customer account or
production credentials on the public store.

Once the actual website release is published, manually dispatch
`PrestaShop published artifact smoke` with the approved ZIP SHA-256. It verifies
both public ZIP aliases and checksums, both installation guides, and canonical
API/CDN assets. Alert on any failure; a download checksum and HTTP 200 do not
prove chat. Real two-way chat and unlink/revoke against the authorized public
test tenant remain required at release and after identity/transport changes.
Do not invent download-to-chat conversion metrics; use only aggregate,
permitted telemetry already emitted by Convor. No automatic transfer of
merchant/visitor data to support.

On critical regressions stop rollout, disable the module if necessary,
reproduce with the same archive, fix with behavior-based red→green regression
tests, rebuild and rerun the matrix. Do not redistribute an unverified ZIP or
change the current version alias silently.
