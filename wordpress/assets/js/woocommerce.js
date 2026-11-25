(() => {
  const configuration = document.currentScript?.dataset.convorContext;
  if (!configuration) return;

  let context;
  try {
    context = JSON.parse(configuration);
  } catch {
    return;
  }

  const initial = context.attributes;
  let product = { ...initial, variationId: null };
  let cartRequest;
  let generation = 0;
  let initializedHandle;
  let initializing = false;

  // The legacy global facade can target a different project's primary
  // instance on a multi-widget page. Never send cart data through it.
  function selectedHandle() {
    const instances = window.Convor?.getInstances?.();
    if (!Array.isArray(instances) || !context.key) return undefined;
    const matches = instances.filter(
      (handle) => handle.widgetKey === context.key,
    );
    return matches.length === 1 ? matches[0] : undefined;
  }

  const permitted = () => {
    if (!context.deferred) return true;
    const consentType =
      typeof window.wp_consent_type === "undefined"
        ? window.wp_fallback_consent_type
        : window.wp_consent_type;
    return (
      consentType === "optin" &&
      typeof window.wp_has_consent === "function" &&
      window.wp_has_consent("marketing") === true
    );
  };

  async function synchronize() {
    const handle = selectedHandle();
    if (!handle || handle !== initializedHandle || !permitted()) return;
    const id = ++generation;
    cartRequest?.abort();
    cartRequest = new AbortController();
    const api = handle.api;
    const attributes = { ...product, cartTotal: null, cartCurrency: null };
    try {
      const url = new URL(context.cartUrl, window.location.href);
      if (url.origin === window.location.origin) {
        const response = await fetch(url, {
          credentials: "same-origin",
          cache: "no-store",
          signal: cartRequest.signal,
        });
        if (response.ok) {
          const { totals } = await response.json();
          const minorUnits = Number(totals?.currency_minor_unit);
          const amount = Number(totals?.total_items);
          if (
            totals?.total_items !== undefined &&
            Number.isSafeInteger(amount) &&
            Number.isInteger(minorUnits) &&
            minorUnits >= 0 &&
            minorUnits <= 6 &&
            /^[A-Z]{3}$/.test(totals.currency_code)
          ) {
            attributes.cartTotal = (amount / 10 ** minorUnits).toFixed(
              minorUnits,
            );
            attributes.cartCurrency = totals.currency_code;
          }
        }
      }
    } catch {
      // No cart is preferable to stale or another session's data.
    }
    if (id !== generation || !permitted() || selectedHandle() !== handle)
      return;
    try {
      await api.setAttributes(attributes);
    } catch {
      // The host page and checkout must work even if Convor is unavailable.
    }
  }

  async function initialize() {
    const handle = selectedHandle();
    if (!handle || handle === initializedHandle || initializing || !permitted())
      return;
    initializing = true;
    try {
      const state = await handle.api.ready();
      if (!state?.ready || !permitted() || selectedHandle() !== handle) return;
      initializedHandle = handle;
      await synchronize();
    } catch {
      // A denied domain, unavailable API or aborted initialization is not
      // a reason to fail the merchant's storefront.
    } finally {
      initializing = false;
    }
  }

  // The loader is async. Observe its actual load event and attempt readiness
  // after DOM ready (auto-initialization may be deferred until that event).
  document.addEventListener(
    "load",
    (event) => {
      if (
        event.target?.id === "convor-live-chat-js" ||
        event.target?.dataset?.convorConsentLoader === "1"
      )
        void initialize();
    },
    true,
  );
  document.addEventListener(
    "DOMContentLoaded",
    () => setTimeout(() => void initialize(), 0),
    {
      once: true,
    },
  );
  document.addEventListener("wp_listen_for_consent_change", () => {
    if (!permitted()) {
      generation++;
      cartRequest?.abort();
    } else {
      void initialize();
    }
  });
  document.addEventListener(
    "wc-blocks_added_to_cart",
    () => void synchronize(),
  );
  document.addEventListener(
    "wc-blocks_removed_from_cart",
    () => void synchronize(),
  );

  if (window.jQuery) {
    const body = window.jQuery(document.body);
    body.on(
      "added_to_cart removed_from_cart updated_cart_totals updated_wc_div",
      () => void synchronize(),
    );
    body.on("found_variation", (_event, variation) => {
      product = {
        ...initial,
        variationId: variation.variation_id ?? null,
        productPrice: Number.isFinite(variation.display_price)
          ? String(variation.display_price)
          : null,
      };
      void synchronize();
    });
    body.on("reset_data", () => {
      product = { ...initial, variationId: null };
      void synchronize();
    });
  }
  void initialize();
})();
