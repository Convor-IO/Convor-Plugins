const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const key = "convor_wpk_" + "a".repeat(64);
const source = fs.readFileSync(
  path.join(__dirname, "../prestashop/views/js/consent.js"),
  "utf8",
);
const tick = () => new Promise((resolve) => setImmediate(resolve));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const dom = new JSDOM(
    `<input name="id_product" value="99"><div class="js-product-details" data-product='{"id_product":42,"id_product_attribute":12}'></div>`,
    {
      url: "https://shop.example.test/",
      runScripts: "outside-only",
    },
  );
  const { window } = dom;
  const { document } = window;
  const tag = document.createElement("script");
  Object.assign(tag.dataset, {
    key,
    convorSrc: "https://cdn.convor.io/widget.js",
    convorConsent: "1",
    convorContext: "/index.php?fc=module&module=convor&controller=context",
    convorProduct: "42",
    convorVerification: "challenge",
  });
  Object.defineProperty(document, "currentScript", { get: () => tag });
  const handlers = {};
  window.prestashop = {
    on: (name, callback) => {
      handlers[name] = callback;
    },
  };
  const requests = [];
  const sent = [];
  let destroyed = 0;
  let ready;
  const readiness = new Promise((resolve) => {
    ready = resolve;
  });
  window.Convor = {
    matchesPrimaryInstallation: (expected, handle) =>
      expected === key && handle === undefined,
    ready: () => readiness,
    setAttributes: async (attributes) => sent.push({ ...attributes }),
    destroy: () => {
      destroyed++;
    },
  };
  window.fetch = async (url, options) => {
    assert.equal(url.origin, window.location.origin);
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.cache, "no-store");
    assert.equal(options.method, "POST");
    requests.push({ options, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({
        attributes: {
          productId: "42",
          variationId: "12",
          cartTotal: "78.00",
          cartCurrency: "PLN",
          email: "private@example.test",
        },
      }),
    };
  };
  try {
    window.eval(source);
    await tick();
    assert.equal(document.querySelectorAll("script[src]").length, 0);
    assert.equal(requests.length, 0);
    window.convorPrestaShopConsent = true;
    const change = () =>
      document.dispatchEvent(new window.Event("convor:prestashop-consent"));
    change();
    change();
    const loaders = document.querySelectorAll(
      "script[data-convor-prestashop-loader]",
    );
    assert.equal(loaders.length, 1);
    assert.equal(loaders[0].dataset.key, key);
    assert.equal(loaders[0].dataset.convorVerification, "challenge");
    loaders[0].dispatchEvent(new window.Event("load"));
    await tick();
    assert.equal(requests.length, 0);
    ready({ ready: true });
    await tick();
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0].body, {
      widgetKey: key,
      productId: "42",
      variationId: "12",
    });
    assert.equal(sent[0].cartTotal, "78.00");
    assert.equal(sent[0].email, undefined);
    document.querySelector(".js-product-details").dataset.product =
      JSON.stringify({ id_product: 42, id_product_attribute: 15 });
    handlers.updatedProduct();
    await delay(250);
    assert.equal(requests[1].body.variationId, "15");
    tag.dataset.convorProduct = "0";
    // Hummingbird emits updateCart after its add-to-cart request. Simulate
    // the actual storefront bus, not a direct call to the bridge.
    handlers.updateCart?.();
    await delay(250);
    assert.equal(requests[2].body.productId, null);
    assert.equal(requests[2].body.variationId, null);
    window.convorPrestaShopConsent = false;
    change();
    assert.equal(destroyed, 1);
    assert.equal(
      document.querySelectorAll("script[data-convor-prestashop-loader]").length,
      0,
    );
    handlers.updatedCart();
    await delay(250);
    assert.equal(requests.length, 3);
    console.log(
      "PASS: PrestaShop consent, widget readiness, page context, data allowlist, cart events, withdrawal",
    );
  } finally {
    dom.window.close();
  }
}
async function managedSessionTest() {
  const dom = new JSDOM("<html><head></head></html>", {
    url: "https://shop.example.test/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const { document } = window;
  const script = document.createElement("script");
  Object.assign(script.dataset, {
    key,
    convorSrc: "https://cdn.convor.io/widget.js",
    convorContext: "/index.php?fc=module&module=convor&controller=context",
    convorIdentity: "1",
    convorConsent: "1",
  });
  Object.defineProperty(document, "currentScript", { get: () => script });
  const a = "11111111-1111-4111-8111-111111111111";
  const b = "22222222-2222-4222-8222-222222222222";
  let current = a;
  let mounted = false;
  let destroyed = 0;
  const requests = [];
  const inits = [];
  const identities = [];
  window.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    if (body.action === "session")
      return { ok: true, json: async () => ({ sessionHandle: current }) };
    assert.equal(body.sessionHandle, current);
    return {
      ok: true,
      json: async () => ({
        identity: {
          id: current === a ? "account-a" : "account-b",
          userHash: "a".repeat(64),
        },
      }),
    };
  };
  const sdk = {
    supportsManagedVisitorSession: true,
    matchesPrimaryInstallation: (expected, handle) =>
      mounted &&
      inits.at(-1)?.key === expected &&
      inits.at(-1)?.managedVisitorHandle === handle,
    getInstances: () => (mounted ? [{}] : []),
    init: async (options) => {
      inits.push({ ...options });
      mounted = true;
    },
    ready: async () => ({ ready: true }),
    getVisitorId: () => current,
    identify: async (identity) => identities.push(identity.id),
    on: () => {},
    destroy: () => {
      destroyed++;
      mounted = false;
    },
  };
  window.Convor = sdk;
  try {
    window.eval(source);
    await tick();
    assert.equal(requests.length, 0);
    assert.equal(inits.length, 0);
    window.convorPrestaShopConsent = true;
    document.dispatchEvent(new window.Event("convor:prestashop-consent"));
    const loader = document.querySelector(
      "script[data-convor-prestashop-loader]",
    );
    assert.ok(loader);
    assert.equal(
      loader.dataset.key,
      undefined,
      "managed widget must not auto-initialize",
    );
    loader.dispatchEvent(new window.Event("load"));
    await tick();
    await tick();
    assert.equal(inits.length, 1);
    assert.equal(inits[0].managedVisitorHandle, a);
    assert.deepEqual(identities, ["account-a"]);
    // Simulate the other shop account taking over the current cookie.
    current = b;
    window.dispatchEvent(new window.Event("focus"));
    await tick();
    await tick();
    assert.ok(destroyed >= 1);
    assert.equal(inits.length, 2);
    assert.equal(inits[1].managedVisitorHandle, b);
    assert.deepEqual(identities, ["account-a", "account-b"]);
    window.convorPrestaShopConsent = false;
    document.dispatchEvent(new window.Event("convor:prestashop-consent"));
    assert.equal(mounted, false);
    console.log(
      "PASS: verified customer session bootstrap, no auto-init, account switch and consent withdrawal",
    );
  } finally {
    dom.window.close();
  }
}
async function foreignWidgetTest() {
  const dom = new JSDOM("<html><head></head></html>", {
    url: "https://shop.example.test/",
    runScripts: "outside-only",
  });
  const { window } = dom;
  const { document } = window;
  const tag = document.createElement("script");
  Object.assign(tag.dataset, {
    key,
    convorSrc: "https://cdn.convor.io/widget.js",
    convorConsent: "1",
    convorContext: "/index.php?fc=module&module=convor&controller=context",
  });
  Object.defineProperty(document, "currentScript", { get: () => tag });
  const handlers = {};
  window.prestashop = {
    on: (name, handler) => {
      handlers[name] = handler;
    },
  };
  const foreignKey = "convor_wpk_" + "b".repeat(64);
  let currentKey = key;
  let release;
  const delayed = new Promise((resolve) => {
    release = resolve;
  });
  let requests = 0;
  const sent = [];
  let destroyed = 0;
  window.Convor = {
    matchesPrimaryInstallation: (expected, handle) =>
      expected === currentKey && handle === undefined,
    ready: async () => ({ ready: true }),
    setAttributes: async (attributes) =>
      sent.push({ key: currentKey, ...attributes }),
    destroy: () => {
      destroyed++;
    },
  };
  window.fetch = async () => {
    requests++;
    if (requests > 1) await delayed;
    return {
      ok: true,
      json: async () => ({ attributes: { cartTotal: "78.00" } }),
    };
  };
  try {
    window.convorPrestaShopConsent = true;
    window.eval(source);
    await tick();
    const loader = document.querySelector(
      "script[data-convor-prestashop-loader]",
    );
    loader.dispatchEvent(new window.Event("load"));
    await tick();
    assert.equal(requests, 1);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].key, key);
    handlers.updatedCart();
    await delay(250);
    assert.equal(requests, 2);
    // An independently installed GTM tag reinitializes the primary widget
    // with another website while the store context request is in flight.
    currentKey = foreignKey;
    release();
    await tick();
    await tick();
    assert.equal(
      sent.length,
      1,
      "Late store context must not enter the foreign website",
    );
    handlers.updatedCart();
    await delay(250);
    assert.equal(requests, 2, "Do not read more context for a foreign widget");
    window.convorPrestaShopConsent = false;
    document.dispatchEvent(new window.Event("convor:prestashop-consent"));
    assert.equal(
      destroyed,
      0,
      "Do not destroy a widget owned by another integration",
    );
    console.log(
      "PASS: conflicting GTM website cannot receive late or new PrestaShop context",
    );
  } finally {
    dom.window.close();
  }
}
main()
  .then(managedSessionTest)
  .then(foreignWidgetTest)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
