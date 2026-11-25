(() => {
  const script = document.currentScript;
  if (!script?.dataset.convorSrc) return;
  const { key, convorSrc, convorContext, convorConsent, convorIdentity } =
    script.dataset;
  const managed = convorIdentity === "1";
  const permitted = () =>
    convorConsent !== "1" || window.convorPrestaShopConsent === true;
  const validHandle = (value) =>
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value,
    );
  let loader;
  let withdrawn = false;
  let initializing = false;
  let active = false;
  let generation = 0;
  let lifecycle = 0;
  let rotating = false;
  let contextRequest;
  let contextTimer;
  let sessionHandle;
  let mounted = false;
  let checkingSession = false;
  let sessionTimer;
  let channel;

  async function context(body, signal) {
    const url = new URL(convorContext, location.href);
    if (url.origin !== location.origin || !permitted())
      throw new Error("Context unavailable");
    return fetch(url, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Convor-Context": "1",
      },
      signal,
      body: JSON.stringify({ widgetKey: key, ...body }),
    });
  }

  // GTM/manual snippets may independently re-initialize the singleton.
  // Never send store context to, or destroy, a different website/session.
  const ownsPrimary = () =>
    (!managed || (mounted && validHandle(sessionHandle))) &&
    window.Convor?.matchesPrimaryInstallation?.(
      key,
      managed ? sessionHandle : undefined,
    ) === true;

  function stopWidget() {
    generation++;
    lifecycle++;
    active = false;
    initializing = false;
    const owned = ownsPrimary();
    mounted = false;
    contextRequest?.abort();
    clearTimeout(contextTimer);
    if (owned) window.Convor?.destroy?.();
  }

  async function session() {
    const response = await context(
      { action: "session" },
      AbortSignal.timeout(5000),
    );
    if (!response.ok) throw new Error("Store session unavailable");
    const result = await response.json();
    if (!validHandle(result.sessionHandle))
      throw new Error("Invalid store session");
    if (result.changed) channel?.postMessage("changed");
    return result.sessionHandle;
  }

  async function rotate() {
    if (
      !managed ||
      !permitted() ||
      withdrawn ||
      !sessionHandle ||
      rotating ||
      !ownsPrimary()
    )
      return;
    rotating = true;
    const previous = sessionHandle;
    stopWidget();
    try {
      const response = await context(
        { action: "reset", sessionHandle: previous },
        AbortSignal.timeout(5000),
      );
      if (!response.ok && response.status !== 409) return;
      channel?.postMessage("changed");
      location.reload();
    } catch {
      // Fail closed; do not recover a revoked handle or the legacy browser identity.
    }
  }

  function selectedVariation(productId) {
    // Classic and Hummingbird publish the current product after AJAX
    // replacement in the product-details node. Never read a product card.
    const details = document.querySelector(".js-product-details[data-product]");
    if (details) {
      try {
        const product = JSON.parse(details.dataset.product);
        if (
          String(product.id_product) === productId &&
          Number.isSafeInteger(Number(product.id_product_attribute)) &&
          Number(product.id_product_attribute) > 0
        ) {
          return String(product.id_product_attribute);
        }
      } catch {
        // Older/custom themes can expose a hidden combination field.
      }
    }
    const value = document.querySelector(
      '#add-to-cart-or-refresh input[name="id_product_attribute"]',
    )?.value;
    return /^\d+$/.test(value ?? "") && Number(value) > 0 ? value : null;
  }

  async function synchronize() {
    if (!active || !convorContext || !permitted() || withdrawn) return;
    if (!ownsPrimary()) {
      stopWidget();
      return;
    }
    const current = ++generation;
    contextRequest?.abort();
    const request = new AbortController();
    contextRequest = request;
    const attributes = {
      productId: null,
      variationId: null,
      productName: null,
      productPrice: null,
      productCurrency: null,
      cartTotal: null,
      cartCurrency: null,
    };
    let result;
    try {
      const productPage = Number(script.dataset.convorProduct) > 0;
      const variant = productPage
        ? selectedVariation(script.dataset.convorProduct)
        : null;
      const response = await context(
        {
          productId: productPage ? script.dataset.convorProduct : null,
          variationId: variant,
          ...(managed
            ? { sessionHandle, visitorId: window.Convor.getVisitorId() }
            : {}),
        },
        request.signal,
      );
      if (current !== generation || !permitted() || withdrawn) return;
      if (!ownsPrimary()) {
        stopWidget();
        return;
      }
      if (managed && !response.ok) {
        stopWidget();
        if (response.status === 409) location.reload();
        return;
      }
      if (response.ok) result = await response.json();
    } catch {
      if (current === generation && managed && !withdrawn) stopWidget();
      if (managed) return;
    }
    if (current !== generation || !permitted() || withdrawn) return;
    if (!ownsPrimary()) {
      stopWidget();
      return;
    }
    try {
      if (managed && result?.identity)
        await window.Convor.identify(result.identity);
      if (current !== generation || !permitted() || withdrawn) return;
      if (!ownsPrimary()) {
        stopWidget();
        return;
      }
      if (result?.attributes && typeof result.attributes === "object") {
        for (const name of Object.keys(attributes)) {
          const value = result.attributes[name];
          if (typeof value === "string" || value === null)
            attributes[name] = value;
        }
        await window.Convor.setAttributes(attributes);
      } else if (!managed) {
        await window.Convor.setAttributes(attributes);
      }
    } catch {
      if (current === generation && managed) stopWidget();
      // Storefront and checkout remain independent of chat availability.
    }
  }

  function queueContext() {
    clearTimeout(contextTimer);
    contextTimer = setTimeout(() => void synchronize(), 200);
  }

  async function initialize() {
    if (
      !convorContext ||
      active ||
      initializing ||
      !permitted() ||
      withdrawn ||
      typeof window.Convor?.ready !== "function"
    )
      return;
    initializing = true;
    const epoch = lifecycle;
    try {
      const state = await window.Convor.ready();
      if (
        epoch !== lifecycle ||
        !state?.ready ||
        !permitted() ||
        withdrawn ||
        !ownsPrimary()
      )
        return;
      active = true;
      await synchronize();
    } catch {
      // Invalid key, denied origin or revoked session.
      if (managed && epoch === lifecycle) stopWidget();
    } finally {
      if (epoch === lifecycle) initializing = false;
    }
  }

  async function mountManaged() {
    if (mounted || !permitted() || withdrawn || document.hidden) return;
    const api = window.Convor;
    // An older widget ignores managedVisitorHandle. Never initialize it with
    // customer identity, even if the module was updated before the CDN.
    if (
      api?.supportsManagedVisitorSession !== true ||
      typeof api.matchesPrimaryInstallation !== "function" ||
      api.getInstances().length !== 0
    )
      return;
    const current = generation;
    try {
      sessionHandle = await session();
      if (
        current !== generation ||
        !permitted() ||
        withdrawn ||
        document.hidden ||
        api.getInstances().length !== 0
      )
        return;
      mounted = true;
      const cdn = new URL(convorSrc);
      const apiBase = ["localhost", "127.0.0.1"].includes(cdn.hostname)
        ? cdn.origin
        : "https://api.convor.io";
      await api.init({
        key,
        managedVisitorHandle: sessionHandle,
        apiBase,
        widgetUrl: `${cdn.origin}/widget-iframe.html`,
      });
      if (
        current !== generation ||
        !permitted() ||
        withdrawn ||
        document.hidden ||
        !ownsPrimary()
      ) {
        if (mounted) stopWidget();
        return;
      }
      api.on("reset", () => void rotate());
      api.on("unavailable", (event) => {
        if (event.reason === "VISITOR_SESSION_REVOKED") void rotate();
        else stopWidget();
      });
      void initialize();
    } catch {
      if (current === generation) stopWidget();
    }
  }

  async function revalidateSession() {
    if (
      !managed ||
      checkingSession ||
      rotating ||
      withdrawn ||
      !permitted() ||
      document.hidden ||
      !loader
    )
      return;
    checkingSession = true;
    try {
      if (mounted && !ownsPrimary()) stopWidget();
      if (!mounted) {
        await mountManaged();
      } else {
        const handle = await session();
        if (withdrawn || !permitted() || document.hidden) return;
        if (handle !== sessionHandle) {
          stopWidget();
          await mountManaged();
        }
      }
    } catch {
      stopWidget();
    } finally {
      checkingSession = false;
    }
  }

  function reconcile() {
    if (withdrawn) return;
    if (!permitted()) {
      if (loader) {
        withdrawn = true;
        clearInterval(sessionTimer);
        channel?.close();
        stopWidget();
        loader.remove();
        location.reload();
      }
      return;
    }
    if (loader) return;
    if (document.querySelector("script[data-convor-prestashop-loader]")) return;
    loader = document.createElement("script");
    loader.src = convorSrc;
    loader.async = true;
    // For managed identity, only programmatic init may supply the session.
    if (!managed) loader.dataset.key = key;
    loader.dataset.convorPrestashopLoader = "1";
    if (script.dataset.convorVerification)
      loader.dataset.convorVerification = script.dataset.convorVerification;
    loader.addEventListener("load", () => {
      const start = () =>
        managed ? void revalidateSession() : void initialize();
      if (document.readyState === "loading")
        document.addEventListener("DOMContentLoaded", start, { once: true });
      else start();
    });
    document.head.appendChild(loader);
  }

  function subscribe() {
    for (const event of ["updateCart", "updatedCart", "updatedProduct"])
      window.prestashop?.on?.(event, queueContext);
  }
  document.addEventListener("convor:prestashop-consent", reconcile);
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      subscribe();
      reconcile();
      if (!managed) void initialize();
    },
    { once: true },
  );
  if (document.readyState !== "loading") subscribe();

  if (managed) {
    if (typeof BroadcastChannel === "function") {
      channel = new BroadcastChannel(`convor-prestashop-session-${key}`);
      channel.onmessage = () => {
        stopWidget();
        void revalidateSession();
      };
    }
    // Destroy before a hidden page can be restored after a login/logout in
    // another tab. The new instance is bound to the current shop session.
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopWidget();
      else void revalidateSession();
    });
    window.addEventListener("pagehide", stopWidget);
    window.addEventListener("pageshow", () => void revalidateSession());
    window.addEventListener("focus", () => void revalidateSession());
    sessionTimer = setInterval(() => void revalidateSession(), 15000);
  } else {
    window.addEventListener("pageshow", queueContext);
  }
  reconcile();
})();
