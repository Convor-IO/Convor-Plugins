(() => {
  const configuration = document.currentScript;
  if (!configuration?.dataset.convorSrc) return;
  let loader;
  let withdrawn = false;
  let existingIds = new Set();

  function permitted() {
    // WP Consent API defaults to allow without an opt-in CMP. In explicit
    // consent mode, fail closed until the manager declares opt-in.
    // The official API exposes server-selected consent via
    // wp_fallback_consent_type, and a CMP may override it in the browser.
    const consentType =
      typeof window.wp_consent_type === "undefined"
        ? window.wp_fallback_consent_type
        : window.wp_consent_type;
    return (
      consentType === "optin" &&
      typeof window.wp_has_consent === "function" &&
      window.wp_has_consent("marketing") === true
    );
  }

  function reconcile() {
    if (withdrawn) return;
    if (!permitted()) {
      if (loader) {
        withdrawn = true;
        loader.remove();
        // Never destroy an independently installed widget via the singleton
        // facade. Only stop matching instances created after our loader.
        for (const handle of window.Convor?.getInstances?.() ?? []) {
          if (
            handle.widgetKey === configuration.dataset.key &&
            !existingIds.has(handle.id)
          ) {
            handle.destroy();
          }
        }
        // Also stop an in-flight loader before a subsequent page can track.
        // The CMP has persisted the new choice by the time it emits the event.
        window.location.reload();
      }
      return;
    }
    if (loader) return;
    existingIds = new Set(
      (window.Convor?.getInstances?.() ?? []).map((handle) => handle.id),
    );
    loader = document.createElement("script");
    loader.src = configuration.dataset.convorSrc;
    loader.async = true;
    loader.dataset.key = configuration.dataset.key;
    if (configuration.dataset.widgetUrl) {
      loader.dataset.widgetUrl = configuration.dataset.widgetUrl;
    }
    if (configuration.dataset.convorVerification) {
      loader.dataset.convorVerification =
        configuration.dataset.convorVerification;
    }
    loader.dataset.convorConsentLoader = "1";
    document.head.appendChild(loader);
  }

  document.addEventListener("wp_consent_type_defined", reconcile);
  document.addEventListener("wp_listen_for_consent_change", reconcile);
  document.addEventListener("DOMContentLoaded", reconcile, { once: true });
  reconcile();
})();
