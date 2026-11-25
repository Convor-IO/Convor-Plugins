const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

function fixture(script, dataset) {
  const dom = new JSDOM("<html><head></head><body></body></html>", {
    url: "https://shop.example.test/product/hoodie/",
    runScripts: "outside-only",
  });
  const { window } = dom;
  const { document } = window;
  const tag = document.createElement("script");
  Object.assign(tag.dataset, dataset);
  Object.defineProperty(document, "currentScript", {
    configurable: true,
    get: () => tag,
  });
  const run = () =>
    window.eval(
      fs.readFileSync(
        path.join(__dirname, "../wordpress/assets/js", script),
        "utf8",
      ),
    );
  return { window, document, run, close: () => dom.window.close() };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));
const key = `convor_wpk_${"a".repeat(64)}`;

async function consentTest() {
  const { window, document, run, close } = fixture("consent.js", {
    key,
    convorSrc: "https://cdn.convor.io/widget.js",
    convorVerification: "challenge",
  });
  let allowed = false;
  let unrelatedDestroyed = 0;
  let selectedDestroyed = 0;
  const unrelated = {
    id: "unrelated",
    widgetKey: `convor_wpk_${"b".repeat(64)}`,
    destroy: () => unrelatedDestroyed++,
  };
  const handles = [unrelated];
  window.Convor = {
    getInstances: () => handles,
    destroy: () => unrelatedDestroyed++,
  };
  try {
    // Server-side opt-in from WP Consent API 2.1.0.
    window.wp_fallback_consent_type = "optin";
    window.wp_has_consent = (category) => category === "marketing" && allowed;
    run();
    await tick();
    assert.equal(document.querySelectorAll("script[src]").length, 0);
    allowed = true;
    document.dispatchEvent(new window.Event("wp_listen_for_consent_change"));
    document.dispatchEvent(new window.Event("wp_listen_for_consent_change"));
    const scripts = document.querySelectorAll("script[src]");
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0].src, "https://cdn.convor.io/widget.js");
    assert.equal(scripts[0].dataset.key, key);
    assert.equal(scripts[0].dataset.convorVerification, "challenge");
    handles.push({
      id: "newly-loaded",
      widgetKey: key,
      destroy: () => selectedDestroyed++,
    });
    allowed = false;
    document.dispatchEvent(new window.Event("wp_listen_for_consent_change"));
    assert.equal(document.querySelectorAll("script[src]").length, 0);
    assert.equal(
      unrelatedDestroyed,
      0,
      "withdrawal must not destroy another widget",
    );
    assert.equal(
      selectedDestroyed,
      1,
      "withdrawal must destroy this installation",
    );
  } finally {
    close();
  }
}

async function wooTest() {
  const { window, document, run, close } = fixture("woocommerce.js", {
    convorContext: JSON.stringify({
      key,
      attributes: {
        productId: 42,
        productName: "Hoodie",
        productPrice: "39",
        currency: "PLN",
      },
      cartUrl: "https://shop.example.test/wp-json/wc/store/v1/cart",
      deferred: true,
    }),
  });
  let allowed = false;
  let cartAmount = "7800";
  let requests = 0;
  const sent = [];
  let ready;
  const readiness = new Promise((resolve) => {
    ready = resolve;
  });
  try {
    window.wp_fallback_consent_type = "optin";
    window.wp_has_consent = () => allowed;
    const unrelated = [];
    const other = {
      id: "other",
      widgetKey: `convor_wpk_${"b".repeat(64)}`,
      api: {
        ready: async () => ({ ready: true }),
        setAttributes: async (attributes) => unrelated.push(attributes),
      },
    };
    const target = {
      id: "selected",
      widgetKey: key,
      api: {
        ready: () => readiness,
        setAttributes: async (attributes) => sent.push({ ...attributes }),
      },
    };
    window.Convor = {
      ...other.api,
      getInstances: () => [other, target],
    };
    window.fetch = async (url, options) => {
      requests++;
      assert.equal(url.origin, "https://shop.example.test");
      assert.equal(options.credentials, "same-origin");
      assert.equal(options.cache, "no-store");
      return {
        ok: true,
        json: async () => ({
          totals: {
            total_items: cartAmount,
            currency_minor_unit: 2,
            currency_code: "PLN",
          },
          items: [{ name: "private cart line" }],
        }),
      };
    };
    run();
    await tick();
    assert.equal(requests, 0);
    assert.equal(sent.length, 0);
    allowed = true;
    document.dispatchEvent(new window.Event("wp_listen_for_consent_change"));
    await tick();
    assert.equal(
      requests,
      0,
      "wait for the actual widget, not another site's primary widget",
    );
    ready({ ready: true });
    await tick();
    assert.equal(requests, 1);
    assert.equal(sent[0].cartTotal, "78.00");
    assert.equal(sent[0].cartCurrency, "PLN");
    assert.equal(sent[0].productId, 42);
    assert.ok(!JSON.stringify(sent).includes("private cart line"));
    cartAmount = "0";
    document.dispatchEvent(new window.Event("wc-blocks_removed_from_cart"));
    await tick();
    assert.equal(sent[1].cartTotal, "0.00");
    allowed = false;
    document.dispatchEvent(new window.Event("wp_listen_for_consent_change"));
    document.dispatchEvent(new window.Event("wc-blocks_added_to_cart"));
    await tick();
    assert.equal(requests, 2);
    assert.equal(sent.length, 2);
    assert.equal(
      unrelated.length,
      0,
      "never send Woo data to a different widget",
    );
  } finally {
    close();
  }
}

(async () => {
  await consentTest();
  await wooTest();
  console.log(
    "PASS: consent gating, loader idempotency, WooCommerce session context and cart updates",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
