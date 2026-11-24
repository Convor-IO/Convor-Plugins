const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const key = "convor_wpk_testsite00000000000000000000000000000000000000000000";
const loaderUrl = "https://cdn.convor.io/widget.js";
const snippet = readFileSync(
  join(__dirname, "../builders/sky-shop/consent-snippet.html"),
  "utf8",
).replace('data-key="YOUR_WIDGET_KEY"', `data-key="${key}"`);

async function openShop(t, html = snippet) {
  const dom = new JSDOM(`<!doctype html><head>${html}</head><body></body>`, {
    runScripts: "dangerously",
    url: "https://shop.example/category/",
  });
  t.after(() => dom.window.close());
  const { window } = dom;
  await new Promise((resolve) => {
    window.document.addEventListener("DOMContentLoaded", resolve, {
      once: true,
    });
  });

  const calls = [];
  const instances = new Set();
  const loaders = () =>
    Array.from(window.document.scripts).filter(
      (script) => script.src === loaderUrl && script.type !== "text/plain",
    );
  const addInstance = (owner) => {
    const handle = {
      destroy() {
        if (instances.delete(handle)) calls.push(["destroy", owner]);
      },
    };
    instances.add(handle);
    return handle;
  };
  const publishWidgetApi = () => {
    window.Convor = {
      getInstances: () => [...instances],
      async createWidget(options) {
        calls.push(["init", options.key, options.widgetUrl]);
        return addInstance("native");
      },
    };
  };

  return {
    calls,
    loaders,
    choose(categories, encode = false) {
      const value = JSON.stringify({ categories });
      this.setConsentCookie(encode ? encodeURIComponent(value) : value);
    },
    setConsentCookie(value) {
      window.document.cookie = `cc_cookie=${value}; Path=/`;
      window.dispatchEvent(new window.Event("pageshow"));
    },
    finishLoading() {
      publishWidgetApi();
      const [loader] = loaders();
      loader.dispatchEvent(new window.Event("load"));
    },
    startIndependentWidget() {
      publishWidgetApi();
      return addInstance("independent");
    },
  };
}

test("Sky-Shop only runs chat while the chosen consent category is granted", async (t) => {
  const shop = await openShop(t, snippet.repeat(2));
  assert.equal(shop.loaders().length, 0);

  shop.choose(["required", "marketing"]);
  assert.equal(shop.loaders().length, 0);

  shop.choose(["required", "analytics"], true);
  assert.equal(shop.loaders().length, 1);
  shop.finishLoading();
  const init = ["init", key, "https://cdn.convor.io/widget-iframe.html"];
  assert.deepEqual(shop.calls, [init]);

  shop.setConsentCookie("invalid-json");
  assert.deepEqual(shop.calls, [init, ["destroy", "native"]]);

  shop.choose(["required", "analytics"]);
  assert.equal(shop.loaders().length, 1);
  assert.deepEqual(shop.calls, [init, ["destroy", "native"], init]);
});

test("A response arriving after consent withdrawal does not start chat", async (t) => {
  const shop = await openShop(t);
  shop.choose(["required", "analytics"]);
  assert.equal(shop.loaders().length, 1);

  shop.choose(["required"]);
  shop.finishLoading();
  assert.deepEqual(shop.calls, []);
});

test("Sky-Shop consent does not replace or destroy an independently installed widget", async (t) => {
  const shop = await openShop(t);
  const existing = shop.startIndependentWidget();
  shop.choose(["required", "analytics"]);
  shop.choose(["required"]);
  assert.deepEqual(shop.calls, []);
  assert.equal(shop.loaders().length, 0);

  existing.destroy();
  shop.choose(["required", "analytics"]);
  shop.choose(["required"]);
  assert.deepEqual(shop.calls, [
    ["destroy", "independent"],
    ["init", key, "https://cdn.convor.io/widget-iframe.html"],
    ["destroy", "native"],
  ]);
});
