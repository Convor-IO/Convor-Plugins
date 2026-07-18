import {injectConvorWidget} from "./content-script";
/**
 * Toolbar popup logic.
 *
 * Shows the current configuration state for the active tab and offers three
 * controls:
 *   - "Inject now"  — injects the widget into the active tab immediately via
 *                     `chrome.scripting.executeScript` (uses the activeTab
 *                     grant the popup just opened).
 *   - "Auto-inject on this site" toggle — opts the current host into
 *                     `allowedSites` + requests an optional host permission
 *                     so the background worker can auto-inject on future
 *                     navigations. Master `autoInject` is enabled too.
 *   - "Options"     — opens the full settings page.
 */
import {
  type ConvorSettings,
  getSettings,
  hostToOrigin,
  isSlugValid,
  matchesAllowedSites,
  normalizeHost,
  setSettings,
} from "./shared";

const el = {
  statusDot: document.getElementById("status-dot") as HTMLSpanElement,
  statusText: document.getElementById("status-text") as HTMLSpanElement,
  slug: document.getElementById("slug") as HTMLSpanElement,
  host: document.getElementById("host") as HTMLParagraphElement,
  injectBtn: document.getElementById("inject") as HTMLButtonElement,
  autoToggle: document.getElementById("auto") as HTMLInputElement,
  autoRow: document.getElementById("auto-row") as HTMLLabelElement,
  optionsBtn: document.getElementById("options") as HTMLButtonElement,
  toast: document.getElementById("toast") as HTMLDivElement,
} as const;

/** Show a transient toast line (used for inject / permission feedback). */
function toast(message: string): void {
  el.toast.textContent = message;
  el.toast.classList.add("visible");
  window.setTimeout(() => el.toast.classList.remove("visible"), 2200);
}

/** Render the slug + status badge; disables actions when unconfigured. */
function renderConfigured(settings: ConvorSettings): void {
  const configured = isSlugValid(settings.orgSlug);
  if (configured) {
    el.statusDot.classList.add("ok");
    el.statusText.textContent = "Configured";
    el.slug.textContent = settings.orgSlug.trim();
    el.injectBtn.disabled = false;
    el.autoRow.classList.remove("hidden");
  } else {
    el.statusDot.classList.add("warn");
    el.statusText.textContent = "Not configured";
    el.slug.textContent = "—";
    el.injectBtn.disabled = true;
    el.autoRow.classList.add("hidden");
  }
}

/** Get the active tab in the last-focused window. */
async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  return tab;
}

/**
 * Render the per-site auto-inject toggle for the active tab's host. Hidden on
 * pages we can't act on (chrome://, the Web Store, etc.).
 */
async function renderAutoToggle(
  settings: ConvorSettings,
  tab: chrome.tabs.Tab | undefined
): Promise<void> {
  const url = tab?.url;
  if (!url || !/^https?:/.test(url)) {
    el.autoRow.classList.add("hidden");
    el.host.textContent = "";
    return;
  }
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    el.autoRow.classList.add("hidden");
    return;
  }
  el.host.textContent = hostname;
  el.autoRow.classList.remove("hidden");
  el.autoToggle.checked =
    settings.autoInject && matchesAllowedSites(url, settings.allowedSites);
  el.autoToggle.disabled = !isSlugValid(settings.orgSlug);
}

/** Toggle the active host in/out of `allowedSites` and request a host grant. */
async function onAutoToggle(
  checked: boolean,
  tab: chrome.tabs.Tab | undefined
): Promise<void> {
  const settings = await getSettings();
  if (!tab?.url || !isSlugValid(settings.orgSlug)) return;

  const hostname = (() => {
    try {
      return new URL(tab.url).hostname;
    } catch {
      return "";
    }
  })();
  if (!hostname) return;

  const normalized = normalizeHost(hostname);
  const set = new Set(settings.allowedSites.map(normalizeHost).filter(Boolean));
  if (checked) {
    set.add(normalized);
    settings.autoInject = true;
    // Ask for an optional host permission so the background worker can inject
    // on future navigations to this host without a popup click.
    const origin = hostToOrigin(normalized);
    if (origin) {
      try {
        const granted = await chrome.permissions.request({
          origins: [origin],
        });
        if (!granted) {
          toast("Permission denied — auto-inject needs site access.");
          el.autoToggle.checked = false;
          return;
        }
      } catch {
        // `permissions.request` must be called from a user gesture; if the
        // gesture expired we just leave the toggle off.
        el.autoToggle.checked = false;
        return;
      }
    }
  } else {
    set.delete(normalized);
    // Revoke the host permission to keep the install footprint minimal.
    const origin = hostToOrigin(normalized);
    if (origin) {
      chrome.permissions.remove({origins: [origin]}).catch(() => {});
    }
  }

  settings.allowedSites = [...set];
  await setSettings(settings);
  toast(checked ? "Auto-inject enabled for this site." : "Auto-inject off.");
}

/** Inject the widget into the active tab right now. */
async function onInject(tab: chrome.tabs.Tab | undefined): Promise<void> {
  if (!tab?.id) return;
  const settings = await getSettings();
  if (!isSlugValid(settings.orgSlug)) return;

  try {
    const results = await chrome.scripting.executeScript({
      target: {tabId: tab.id},
      func: injectConvorWidget,
      args: [settings.apiBase, settings.orgSlug.trim()],
    });
    const injected = results[0]?.result === true;
    toast(injected ? "Widget injected." : "Widget already present.");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/cannot access|permissions|scripting/i.test(message)) {
      toast("Can't inject here — try the full options page.");
    } else {
      toast(`Inject failed: ${message}`);
    }
  }
}

async function init(): Promise<void> {
  const [settings, tab] = await Promise.all([getSettings(), getActiveTab()]);
  renderConfigured(settings);
  await renderAutoToggle(settings, tab);

  el.injectBtn.addEventListener("click", () => void onInject(tab));
  el.autoToggle.addEventListener(
    "change",
    () => void onAutoToggle(el.autoToggle.checked, tab)
  );
  el.optionsBtn.addEventListener(
    "click",
    () => void chrome.runtime.openOptionsPage()
  );

  // Live-update if settings change while the popup is open (rare, but cheap).
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes.convor) return;
    const next: ConvorSettings = {
      ...settings,
      ...(changes.convor.newValue as Partial<ConvorSettings>),
    };
    renderConfigured(next);
    void renderAutoToggle(next, tab);
  });
}

void init();
