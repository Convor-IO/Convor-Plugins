/*
 * Convor — Ecwid storefront loader.
 *
 * Ecwid injects THIS file on every storefront page (registered once via the
 * Ecwid developer program with the `customize_storefront` scope). We read the
 * per-store public config via Ecwid.getAppPublicConfig(appId) and inject the
 * Convor widget script tag:
 *
 *   <script src="<apiBase>/widget.js" data-key="<slug>" async></script>
 *
 * Public config is published by the merchant from the embedded settings app
 * (POST /api/settings -> PUT /api/v3/{storeId}/storage/public).
 */
(() => {
  // The appId is baked in at build/deploy time by Ecwid, but the same value
  // is echoed in the public config so we can verify the caller. We rely on
  // Ecwid's getAppPublicConfig to return the store-specific JSON.
  const APP_ID = window.__CONVOR_ECWID_APP_ID__ || "";

  function inject(src, key) {
    const s = document.createElement("script");
    s.src = src;
    s.setAttribute("data-key", key);
    s.async = true;
    document.head.appendChild(s);
  }

  function start(slug, apiBase) {
    if (!slug) return;
    const base = apiBase || "https://cdn.convor.io";
    inject(`${base.replace(/\/$/, "")}/widget.js`, slug);
  }

  function readConfig() {
    try {
      // getAppPublicConfig is available on storefront pages for apps with the
      // customize_storefront scope.
      if (
        typeof Ecwid !== "undefined" &&
        typeof Ecwid.getAppPublicConfig === "function"
      ) {
        const raw = Ecwid.getAppPublicConfig(APP_ID);
        if (raw) return JSON.parse(raw);
      }
    } catch (e) {
      // Fall through to no-op.
    }
    return null;
  }

  // Ecwid's storefront events fire when the page/widgets are ready.
  function bootstrap() {
    const cfg = readConfig();
    if (!cfg || !cfg.slug) return;
    start(cfg.slug, cfg.apiBase);
  }

  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    bootstrap();
  } else {
    document.addEventListener("DOMContentLoaded", bootstrap);
  }
})();
