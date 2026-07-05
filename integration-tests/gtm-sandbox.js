/**
 * Minimal GTM sandboxed-JS simulator for testing gtm/template.tpl.
 *
 * GTM custom templates run in a restricted sandbox where `require('api')`
 * returns curated APIs (injectScript, callInWindow, copyFromWindow, …) and
 * `data` is the resolved template-parameter object. We can't run the real GTM
 * sandbox headless, so this stubs just enough of the API surface to let the
 * template's `code()` execute and record what it did.
 *
 * The stubs capture calls (injectScript url + callbacks, callInWindow path +
 * args) so the test can assert the template loads the canonical widget.js URL
 * and then invokes ConvorWidget.init({ key }) — the supported equivalent of
 * the data-key attribute the canonical snippet carries.
 */

/**
 * Build a sandboxed require() + supporting globals for one template run.
 *
 * @param {object} templateData      The `data` object the tag would see.
 * @param {object} loadedWindowState The `window` contents that loading
 *                                   widget.js registers (ConvorWidget). The
 *                                   sandbox merges these into the simulated
 *                                   window AT the moment injectScript fires
 *                                   onSuccess — modelling "the script loaded
 *                                   and registered its global". Before that,
 *                                   copyFromWindow sees them as absent.
 * @returns {{run: (src: string) => object}}
 */
function makeSandbox(templateData, loadedWindowState = {}) {
  // The live simulated window — starts empty, gets the loaded globals merged
  // in when injectScript "succeeds".
  const win = {};

  const calls = {
    injectScript: [],
    callInWindow: [],
    copyFromWindow: [],
    log: [],
    gtmOnSuccess: 0,
    gtmOnFailure: 0,
  };

  const resolvePath = (path) =>
    path.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), win);

  const requireMap = {
    injectScript: (url, onSuccess, onFailure, attrs) => {
      calls.injectScript.push({ url, onSuccess, onFailure, attrs });
      // Simulate the script loading synchronously: widget.js parses and
      // registers its globals onto window, THEN GTM fires onSuccess. Merge
      // the loaded state in first so copyFromWindow('ConvorWidget') inside
      // onSuccess sees it.
      Object.assign(win, loadedWindowState);
      if (typeof onSuccess === "function") {
        onSuccess();
      }
    },
    callInWindow: (path, ...args) => {
      calls.callInWindow.push({ path, args });
      const fn = resolvePath(path);
      if (typeof fn === "function") {
        fn(...args);
      }
    },
    copyFromWindow: (path) => {
      calls.copyFromWindow.push({ path });
      return resolvePath(path);
    },
    logToConsole: (msg) => calls.log.push(msg),
    getType: (v) => {
      if (v === null) {
        return "null";
      }
      if (Array.isArray(v)) {
        return "array";
      }
      return typeof v;
    },
  };

  const data = {
    ...templateData,
    gtmOnSuccess: () => calls.gtmOnSuccess++,
    gtmOnFailure: () => calls.gtmOnFailure++,
  };

  /**
   * Evaluate the template's sandboxed-JS source (as extracted from the
   * ___SANDBOXED_JS_FOR_WEB_TEMPLATE___ section of template.tpl). Returns
   * the captured calls so the caller can assert on them.
   */
  function run(src) {
    const fn = new Function("require", "data", `${src}`);
    fn((name) => requireMap[name], data);
    return calls;
  }

  return { run };
}

module.exports = { makeSandbox };
