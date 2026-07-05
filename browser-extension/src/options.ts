/**
 * Options page logic.
 *
 * Fields:
 *   - Org slug (required)
 *   - API base (default https://cdn.convor.io)
 *   - Auto-inject master toggle
 *   - Allowed sites list (one host per line; `#` starts a comment)
 *
 * Saved to `chrome.storage.sync` on every change, with a live status line.
 */
import {
  type ConvorSettings,
  DEFAULT_API_BASE,
  DEFAULT_SETTINGS,
  getSettings,
  setSettings,
} from "./shared";

const el = {
  form: document.getElementById("form") as HTMLFormElement,
  orgSlug: document.getElementById("orgSlug") as HTMLInputElement,
  apiBase: document.getElementById("apiBase") as HTMLInputElement,
  autoInject: document.getElementById("autoInject") as HTMLInputElement,
  allowedSites: document.getElementById("allowedSites") as HTMLTextAreaElement,
  save: document.getElementById("save") as HTMLButtonElement,
  status: document.getElementById("status") as HTMLParagraphElement,
  reset: document.getElementById("reset") as HTMLButtonElement,
} as const;

/** Load saved settings into the form. */
async function load(): Promise<void> {
  const settings = await getSettings();
  el.orgSlug.value = settings.orgSlug;
  el.apiBase.value = settings.apiBase || DEFAULT_API_BASE;
  el.autoInject.checked = settings.autoInject;
  el.allowedSites.value = settings.allowedSites.join("\n");
}

/**
 * Collect + validate the form into a {@link ConvorSettings} object. Returns
 * `null` with a status message when invalid.
 */
function collect(): ConvorSettings | null {
  const orgSlug = el.orgSlug.value.trim();
  if (!orgSlug) {
    status("Org slug is required.", "error");
    el.orgSlug.focus();
    return null;
  }
  const apiBase = el.apiBase.value.trim() || DEFAULT_API_BASE;
  try {
    // Reject obviously malformed bases early; the URL is otherwise opaque.
    new URL(apiBase);
  } catch {
    status("API base must be a valid URL.", "error");
    el.apiBase.focus();
    return null;
  }

  const allowedSites = el.allowedSites.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  return {
    orgSlug,
    apiBase,
    autoInject: el.autoInject.checked,
    allowedSites,
  };
}

/** Set the status line. `kind` controls the CSS class. */
function status(message: string, kind: "ok" | "error" = "ok"): void {
  el.status.textContent = message;
  el.status.className = `status ${kind}`;
}

/** Persist current form state. */
async function save(): Promise<void> {
  const settings = collect();
  if (!settings) return;
  await setSettings(settings);
  status("Saved.", "ok");
}

el.form.addEventListener("submit", (event) => {
  event.preventDefault();
  void save();
});

el.reset.addEventListener("click", async () => {
  const confirmed = window.confirm(
    "Reset all Convor extension settings to defaults?",
  );
  if (!confirmed) return;
  await setSettings({ ...DEFAULT_SETTINGS });
  await load();
  status("Reset to defaults.", "ok");
});

void load();
