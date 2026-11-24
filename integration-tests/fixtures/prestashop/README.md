# Real PrestaShop release acceptance

This fixture runs against the disposable PrestaShop shop and the isolated SaaS
worktree for issue #1807. No production shop or user data is involved. Do not
point these tests at any other installation.

## Prerequisites and execution

- SaaS branch `feat/prestashop-finalization-1807`, API/CDN on loopback port
  17243, realtime on 17242, dashboard on 17244. Build the widget with matching
  local endpoints and start the real isolated services. The dashboard is only
  required by the browser website-selection test.
- Install the repository's frozen dependencies and its Playwright Chromium
  runtime. Check host memory and port availability before starting.
- From the Plugins worktree run
  `bash integration-tests/fixtures/prestashop/install.sh`. The script builds
  the exact ZIP, starts the isolated store on port 18217, sets local-only
  endpoints, and provisions a synthetic Convor project. The resulting ignored
  environment file contains fixture credentials; never commit it or include
  its contents in logs or screenshots.
- Run:
  ```sh
  source dist/prestashop-qa.env
  pnpm exec playwright test --config integration-tests/playwright.config.ts prestashop.spec.ts --workers=1
  ```
  The fixture uses headless Chromium, with a synthetic regular visitor profile restricted to loopback-only QA. The real server rejects automated-client signals by design. No production protection is modified. The local Centrifugo origin allowlist must include the API origin serving the iframe and the dashboard origin.
  The test uploads through Module Manager if the module is absent. It
  exercises the original-session binding and replay rejection, dashboard
  selection and storefront/operator round-trip, manual key, disabling and
  manual Hummingbird theme embed. Theme modifications are restored in a
  finally block. Use `-g 'API pairing'` for the real pairing route without
  needing Next.js, or `-g 'manual key'` for the manual installation path.
- Compatibility images are pinned by digest in `install.sh` / `docker-compose.yml`. After the primary fixture has provisioned the ignored QA environment, create the other shops individually:
  ```sh
  PRESTASHOP_VERSION=8.2.9 PRESTASHOP_PORT=18218 PRESTASHOP_QA_PROJECT=convor-prestashop-1807-82 bash integration-tests/fixtures/prestashop/install.sh
  PRESTASHOP_VERSION=9.0.3 PRESTASHOP_PORT=18222 PRESTASHOP_QA_PROJECT=convor-prestashop-1807-90 bash integration-tests/fixtures/prestashop/install.sh
  PRESTASHOP_VERSION=9.1.5 PRESTASHOP_PORT=18221 PRESTASHOP_QA_PROJECT=convor-prestashop-1807-91 bash integration-tests/fixtures/prestashop/install.sh
  ```
  Once the four named disposable shops and the isolated SaaS stack exist, run `bash integration-tests/fixtures/prestashop/run-matrix.sh` from the Plugins worktree. The runner creates a fresh synthetic SaaS tenant, verifies the ZIP checksum, reinstalls the exact candidate on each shop, executes all six headless scenarios serially (including signing-secret rotation and audit redaction), verifies every installed archive member and rejects extra files, and stops the two additional 9.0/9.1 fixtures. Use `python3 integration-tests/fixtures/prestashop/verify-installed-archive.py convor-prestashop-1807 convor-prestashop-1807-82 convor-prestashop-1807-90 convor-prestashop-1807-91` to verify the exact installed archive without restarting or changing even the stopped fixtures. It never targets a production store. For an individual run, source `dist/prestashop-qa.env`, then override `PRESTASHOP_URL` for the desired loopback port. The theme test resolves the actual active theme and restores its original content.
- Native PS9.0.3 ships an unconfigured optional `psshipping` 2.0.9 provider. Its native checkout returns HTTP 400 even with Convor disabled; the matrix verifies the real ordinary checkout after temporarily disabling only that provider in the owned fixture and restores its original state. The CI shard uses the same fixture helper and deletes its disposable stack afterwards. `PRESTASHOP_DISABLE_BUNDLED_SHIPPING=1 PRESTASHOP_DEBUG_LOG_ONLY=1 bash integration-tests/fixtures/prestashop/test-debug.sh` runs the real E_ALL diagnostic cases with log-only PHP diagnostics; without that option the native provider baseline remains available for reproduction. This is not a recommendation to change a merchant's shipping configuration or a claim of compatibility with that third-party checkout provider.
- To reinstall a different candidate, use the module lifecycle command in
  this exact disposable container as `www-data` (not root, which can leave
  Symfony caches unwritable). Use a fresh fixture if testing an upgrade.
  A graceful Apache reload can be needed when replacing a same-version
  candidate; never use these fixture commands on a merchant's live shop.
- `bash integration-tests/fixtures/prestashop/test-lifecycle.sh` exercises the historical 1.0.0 archive, migration of valid and legacy values, uninstall cleanup, and reinstall on the owned PS 8.2.9 fixture. It restores an anonymous configuration afterwards.
- `bash integration-tests/fixtures/prestashop/test-multistore.sh` temporarily creates a second actual PrestaShop shop, enables multistore, checks independent settings and proof, and removes the temporary shop. This checks real platform configuration, not two-domain SaaS conversations.
- With the owned PS 8.2.9 fixture running, `source dist/prestashop-qa.env && node integration-tests/fixtures/prestashop/test-real-multistore.mjs` verifies two actual storefront domains, two SaaS organizations/projects, BO shop context isolation, group/all rejection, two live conversations and cross-org history denial. It removes the temporary PrestaShop shop and its configuration; synthetic SaaS organizations remain in the disposable SaaS database for inspection.
- The native MFA pairing test must use a fresh synthetic account, isolated from the main matrix (it enrolls TOTP):
  ```sh
  mkdir -p dist/mfa-qa
  (cd dist/mfa-qa && node ../../integration-tests/fixtures/prestashop/provision-local-qa.mjs)
  (source dist/mfa-qa/dist/prestashop-qa.env && node integration-tests/fixtures/prestashop/test-pairing-mfa.mjs)
  ```
  It verifies password-only denial, actual TOTP login, organization selection, the correct selected project's key and one-time API redemption. The callback URL is synthetic and intercepted locally; the full ZIP matrix independently verifies the real PrestaShop callback. It does not contact an external SSO provider.
- The reference CMP test uses the unmodified MIT-licensed CookieConsent 3.3.0 library, self-hosted by the owned PS8.2.9 Classic shop. Download the pinned npm package into ignored QA storage (its SHA-512 integrity is checked by the script):
  ```sh
  mkdir -p dist/cmp-qa
  npm pack vanilla-cookieconsent@3.3.0 --pack-destination dist/cmp-qa --ignore-scripts
  (source dist/prestashop-qa.env && node integration-tests/fixtures/prestashop/test-cookieconsent.mjs)
  ```
  This exercises the real CMP UI, persistent reject/accept, reload and withdrawal, and checks the actual widget/context requests. It temporarily serves the CMP through the actual Classic template, restores the exact template bytes and configuration in a finally block, and never contacts the CMP vendor. This is a tested reference integration, not a general compliance certification.
- `node integration-tests/fixtures/prestashop/test-bo-acl.mjs` creates a disposable read-only employee with actual Module Manager view access but no Convor configure permission. Its authenticated GET and POST requests must not expose the widget key or change settings/pairing. The employee and profile are deleted in the cleanup path.
- `node integration-tests/fixtures/prestashop/probe-webservice.mjs` checks
  catalog resource availability using a temporary read-only key and restores
  the original Webservice configuration. Set `CONVOR_RUN_CATALOG_ADAPTER=1` to exercise the actual SaaS provider reader using the disposable key and existing test-only SSRF allowlist, e.g.:
  ```sh
  CONVOR_RUN_CATALOG_ADAPTER=1 PRESTASHOP_URL=http://localhost:18218 node integration-tests/fixtures/prestashop/probe-webservice.mjs
  CONVOR_RUN_CATALOG_ADAPTER=1 PRESTASHOP_URL=http://localhost:18217 node integration-tests/fixtures/prestashop/probe-webservice.mjs
  ```
  This verifies bounded catalog pages and variants but does not register a production connection, publish prices/stock, or authorize orders. The shared Advanced registry/worker from #1802 must supply the current authorization snapshot.

- Run `node integration-tests/fixtures/prestashop/capture-extra-docs.mjs` to capture the actual upload dialog, Performance page and checkout in both languages; it restores the employee locale and does not submit an order. With the actual local Website preview running, `CONVOR_GUIDE_URL=http://127.0.0.1:18219 node integration-tests/fixtures/prestashop/test-guide-preview.mjs` checks both localized guides at desktop and mobile sizes, the exact downloadable ZIP hash, every screenshot's alt text, keyboard zoom, focus restoration, and horizontal overflow. `export-guide-pdfs.mjs` renders both reviewer PDFs from that preview. Run `publish-guide-screenshots.py` after capturing the masked screenshots to apply the repository's neutral margin and update image metadata. Set `CONVOR_MARKETPLACE_PDF=1` when exporting to produce separate seller PDFs named `readme_en.pdf` and `readme_pl.pdf` (the Marketplace download step, no off-platform promotional/support hyperlinks). Review them, copy them to `prestashop-marketplace/seller-guides/`, then run `python3 scripts/build-prestashop-marketplace.py --guides prestashop-marketplace/seller-guides`. `bash integration-tests/fixtures/prestashop/test-marketplace-preflight.sh` uploads the exact keyless envelope on the owned PS9.2.1 shop, exercises real pairing and two-way chat, verifies installed files, and restores the direct candidate. It does not constitute official validation. A portal-issued key creates a distinct candidate requiring a new full acceptance run.

## Marketing landing screenshots (actual product chat)

Run this with the owned local PS9.2.1 shop and isolated local SaaS already
running. From the Plugins worktree:

```bash
mkdir -p dist/landing-branded
(cd dist/landing-branded && node ../../integration-tests/fixtures/prestashop/provision-local-qa.mjs --marketing-demo)
source dist/landing-branded/dist/prestashop-qa.env
CONVOR_LANDING_SCREENSHOTS=dist/prestashop-landing-branded node integration-tests/fixtures/prestashop/capture-landing.mjs
```

The script uses a new synthetic TopSoft4U organization and operator, real
public widget key and actual product-page chat/reply in PL/EN and light/dark.
It restores the original shop settings, never contacts production, and does
not use real customer data. Copy the four verified PNGs into Website
`public/docs/screenshots/prestashop/`, update their SHA-prefix revisions on
the landing and guide, and inspect the full browser render. The two upload
images are crops of the existing real localized Module Manager dialog with
its surrounding pixels preserved. Do not generate or composite UI images.

## Public HTTPS QA (local Docker + Cloudflare Tunnel only)

This is a separate synthetic local Compose project, `convor-ps-qa-1807`. No
Netcup stack or production database is needed or permitted for QA.

- From the Plugins worktree run `bash integration-tests/fixtures/prestashop/deploy-public-qa.sh`.
  It provisions a fresh local shop, generates unique synthetic credentials in
  ignored `dist/prestashop-public-qa/.env`, disables mail/payment methods and
  Webservice, and verifies the loopback-only gateway at 18224. Use `--resume`
  only for the same existing owned fixture.
- The named tunnel `convor-prestashop-qa-1807` routes
  `https://ps-qa-1807.topsoft4u.com` to that loopback gateway. Run
  `cloudflared tunnel --config integration-tests/fixtures/prestashop/public-qa-tunnel.yml run convor-prestashop-qa-1807`
  as a managed foreground service. Do not expose the underlying database,
  PrestaShop port, or other local services. The gateway requires independent
  HTTP Basic authentication for BO, blocks private paths, and sets noindex and
  no-store. The Apache config preserves native HTTPS login enforcement behind
  the proxy; never disable SSL enforcement as a workaround.
- Create a dedicated synthetic account in the existing isolated local SaaS
  using `provision-local-qa.mjs` from an ignored subdirectory; source its QA
  env and run `node integration-tests/fixtures/prestashop/test-public-qa.mjs`.
  This proves actual public BO ZIP upload, real HTTPS domain challenge fetched
  by the local SaaS DNS-pinned verifier, rejection of missing proof, and
  invalidation after removing the domain. The exact production archive keeps
  canonical endpoints; the consent gate remains closed to avoid sending local
  keys to production. The test clears settings afterward. Public canonical
  endpoint pairing and chat after promotion are separate acceptance checks.
- Run `bash integration-tests/fixtures/prestashop/test-public-pairing.sh` to
  exercise actual HTTPS BO pairing with the local SaaS and native TOTP MFA.
  It creates a new synthetic tenant, uses the real organization picker,
  rejects password-only authorization, follows the actual public callback,
  verifies PHP redemption and public domain proof, unlinks the module and
  removes the domain. A short-lived internal nginx relay allows only the two
  merchant POST endpoints; no public port or direct connection from the shop
  to the SaaS network. The wrapper restores the exact original shop config,
  resets its synthetic settings and removes the relay. The distributed ZIP
  is unchanged. Set `PRESTASHOP_PUBLIC_CHAT=1` for the actual two-way
  storefront/agent chat over the local API/CDN/WS as well. Chromium normally
  denies a public HTTPS origin's requests to localhost (CDP reports
  `LocalNetworkAccessPermissionDenied`); the chat variant explicitly grants
  local-network access to this exact owned QA origin in its fresh synthetic
  browser context only. No global browser security is disabled, no public
  SaaS endpoint is added, and unrelated visitors stay behind the consent gate.
  This is public merchant HTTPS with local SaaS, not external OAuth/SSO or a
  test of the canonical production API/CDN.
- Stop the specific managed tunnel when no longer needed. Stop/remove the
  dedicated local Compose services through the exact project file and state
  directory; do not remove volumes unless the synthetic fixture is no longer
  required. Do not publish local credentials, keys or auth traces.
- DNS cleanup: the locally installed Cloudflare origin certificate is scoped to
  topsoft4u.com. The initial CLI route added the unintended hostname
  `ps-qa-1807.convor.io.topsoft4u.com`; it was re-bound to this dedicated
  tunnel and matches its default 404 rule, not the unrelated DevSpace tunnel.
  Remove that exact surplus DNS record in the authorized Cloudflare dashboard;
  the cloudflared DNS CLI has no deletion operation.

## Evidence and acceptance

Record tested PrestaShop/PHP/theme versions, actual archive SHA-256, commit
SHAs, Playwright results and the sanitized screenshots. Retain the exact
archive that was tested. Redact the public widget key, pairing code, session
credentials and identity secret in screenshots. A successful upload, page
render, or hermetic test does not prove a two-way chat or identity isolation.

The full matrix and Marketplace validation are separate gates in #1807.
Do not advertise compatibility for untested versions, or publish a guide
containing simulated screenshots.
