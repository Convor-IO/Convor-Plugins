import {CONVOR_DASHBOARD_URL} from "./config.js";
import {escapeHtml, escapeJsonScript, htmlPage} from "./html.js";
import type {ConvorWidgetConfig} from "./widget-config.js";

interface LandingInput {
  installUrl: string;
}

export function renderLanding({installUrl}: LandingInput): string {
  return htmlPage({
    title: "Convor Live Chat for BigCommerce",
    body: `
<div class="wrap">
  <h1>Convor Live Chat</h1>
  <p>Add the Convor chat bubble to your BigCommerce storefront in under a minute.</p>
  <div class="card">
    <h2>How it works</h2>
    <p>1. Install the app and approve the requested permissions.</p>
    <p>2. Enter your Convor org slug in the settings screen.</p>
    <p>3. Convor injects its widget loader into your storefront via the BigCommerce Scripts API.</p>
    <div class="actions">
      <a class="btn" href="${escapeHtml(installUrl)}">Install on BigCommerce</a>
      <a class="btn btn-secondary" href="${escapeHtml(CONVOR_DASHBOARD_URL)}" target="_blank" rel="noopener">Get your org slug</a>
    </div>
    <p class="help">All appearance customization (color, position, greeting) is managed in your Convor dashboard.</p>
  </div>
</div>`,
  });
}

interface SettingsInput {
  storeHash: string;
  ownerEmail: string | null;
  config: ConvorWidgetConfig;
  defaultApiBase: string;
  scriptInstalled: boolean;
}

export function renderSettings(input: SettingsInput): string {
  const {config, defaultApiBase, scriptInstalled} = input;
  const initialState = escapeJsonScript({
    storeHash: input.storeHash,
    ownerEmail: input.ownerEmail,
    config,
    defaultApiBase,
    scriptInstalled,
    dashboardUrl: CONVOR_DASHBOARD_URL,
  });

  return htmlPage({
    title: "Convor settings",
    body: `
<div class="wrap" id="app" data-state="${escapeHtml(initialState)}">
  <h1>Convor settings</h1>
  <p class="muted">Store: <code>${escapeHtml(input.storeHash)}</code></p>

  <div class="card">
    <h2>Connect your Convor account</h2>
    <p>Enter the org slug from <a href="${escapeHtml(CONVOR_DASHBOARD_URL)}" target="_blank" rel="noopener">your Convor dashboard</a> (Settings &rarr; Widget). All appearance customization is managed there.</p>

    <label for="slug">Convor org slug</label>
    <input id="slug" name="slug" type="text" autocomplete="off" placeholder="acme-store" value="${escapeHtml(config.slug)}">
    <p class="help">Lowercase letters, numbers, and dashes. Example: <code>acme-store</code></p>

    <label for="apiBase">Widget CDN base URL</label>
    <input id="apiBase" name="apiBase" type="url" autocomplete="off" value="${escapeHtml(config.apiBase)}">
    <p class="help">Defaults to <code>${escapeHtml(defaultApiBase)}</code>. Only change this if Convor support told you to.</p>

    <div id="banner" hidden></div>

    <div class="actions">
      <button id="save" class="btn" type="button">Save settings</button>
    </div>
  </div>

  <div class="card">
    <h2>Storefront widget</h2>
    <p id="script-status">
      <span class="status-dot status-off" id="script-dot"></span>
      <span id="script-label">Loading&hellip;</span>
    </p>
    <p class="help" id="script-help"></p>
    <div class="actions">
      <button id="install" class="btn btn-secondary" type="button" hidden>Inject widget script</button>
      <button id="uninstall" class="btn btn-secondary" type="button" hidden>Remove widget script</button>
    </div>
  </div>

  <div class="card">
    <h2>The injected snippet</h2>
    <pre id="snippet"></pre>
  </div>
</div>
<script>${SETTINGS_CLIENT_JS}</script>`,
  });
}

interface ErrorInput {
  message: string;
}

export function renderError({message}: ErrorInput): string {
  return htmlPage({
    title: "Convor — something went wrong",
    body: `
<div class="wrap">
  <h1>Something went wrong</h1>
  <div class="card">
    <div class="banner banner-error">${escapeHtml(message)}</div>
    <p>If this keeps happening, contact Convor support and include the message above.</p>
  </div>
</div>`,
  });
}

// Inline client-side script for the settings page. It is a static string —
// no server values are interpolated into it — so there is no XSS surface.
// All server→client data flows through the `data-state` attribute, which the
// client parses as JSON.
const SETTINGS_CLIENT_JS = `
(function () {
  "use strict";
  var root = document.getElementById("app");
  var state = JSON.parse(root.getAttribute("data-state"));

  var slugEl = document.getElementById("slug");
  var apiBaseEl = document.getElementById("apiBase");
  var saveBtn = document.getElementById("save");
  var banner = document.getElementById("banner");
  var installBtn = document.getElementById("install");
  var uninstallBtn = document.getElementById("uninstall");
  var scriptDot = document.getElementById("script-dot");
  var scriptLabel = document.getElementById("script-label");
  var scriptHelp = document.getElementById("script-help");
  var snippetEl = document.getElementById("snippet");

  function snippetText() {
    var base = (apiBaseEl.value || state.defaultApiBase).replace(/\\/+$/, "");
    var slug = (slugEl.value || "").trim();
    return '<script src="' + base + '/widget.js" data-key="' + slug + '" async></' + "script>";
  }
  function renderSnippet() { snippetEl.textContent = snippetText(); }

  function showBanner(kind, text) {
    banner.hidden = false;
    banner.className = "banner banner-" + kind;
    banner.textContent = text;
  }
  function clearBanner() { banner.hidden = true; banner.textContent = ""; }

  function renderScriptStatus() {
    if (state.scriptInstalled) {
      scriptDot.className = "status-dot status-on";
      scriptLabel.textContent = "Widget script is installed on your storefront.";
      scriptHelp.textContent = "The chat bubble loads from " + state.defaultApiBase + ". Changes in the Convor dashboard appear instantly.";
      installBtn.hidden = true;
      uninstallBtn.hidden = false;
    } else {
      scriptDot.className = "status-dot status-off";
      scriptLabel.textContent = "Widget script is not installed.";
      scriptHelp.textContent = "Save your slug, then click \\u201cInject widget script\\u201d to add the chat bubble.";
      installBtn.hidden = false;
      uninstallBtn.hidden = true;
    }
  }

  function setLoading(loading) {
    saveBtn.disabled = loading;
    saveBtn.textContent = loading ? "Saving\\u2026" : "Save settings";
  }

  async function save() {
    clearBanner();
    setLoading(true);
    try {
      var res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeHash: state.storeHash,
          slug: slugEl.value,
          apiBase: apiBaseEl.value,
        }),
      });
      var data = await res.json();
      if (!res.ok || !data.ok) {
        showBanner("error", data.error || ("Save failed (" + res.status + ")."));
        return;
      }
      state.config = data.config;
      showBanner("ok", "Settings saved. Now inject the widget script below.");
    } catch (e) {
      showBanner("error", "Network error: " + (e && e.message ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }

  async function install() {
    clearBanner();
    installBtn.disabled = true;
    try {
      var res = await fetch("/api/install-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeHash: state.storeHash }),
      });
      var data = await res.json();
      if (!res.ok || !data.ok) {
        showBanner("error", data.error || ("Install failed (" + res.status + ")."));
        return;
      }
      state.scriptInstalled = true;
      renderScriptStatus();
      showBanner("ok", "Widget script injected. Open your storefront to see the chat bubble.");
    } catch (e) {
      showBanner("error", "Network error: " + (e && e.message ? e.message : String(e)));
    } finally {
      installBtn.disabled = false;
    }
  }

  async function uninstall() {
    clearBanner();
    uninstallBtn.disabled = true;
    try {
      var res = await fetch("/api/uninstall-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeHash: state.storeHash }),
      });
      var data = await res.json();
      if (!res.ok || !data.ok) {
        showBanner("error", data.error || ("Uninstall failed (" + res.status + ")."));
        return;
      }
      state.scriptInstalled = false;
      renderScriptStatus();
      showBanner("ok", "Widget script removed.");
    } catch (e) {
      showBanner("error", "Network error: " + (e && e.message ? e.message : String(e)));
    } finally {
      uninstallBtn.disabled = false;
    }
  }

  slugEl.addEventListener("input", renderSnippet);
  apiBaseEl.addEventListener("input", renderSnippet);
  saveBtn.addEventListener("click", save);
  installBtn.addEventListener("click", install);
  uninstallBtn.addEventListener("click", uninstall);

  renderSnippet();
  renderScriptStatus();
})();
`;
