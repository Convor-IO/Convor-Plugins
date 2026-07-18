/**
 * Convor settings — Velo backend web module.
 *
 * Exposes two web methods called from the dashboard page (settings-panel/):
 *
 *   - getSettings()          → { slug }   (or null if not configured)
 *   - saveSettings({ slug }) → { slug }   (validates, then embeds)
 *
 * Storage choice
 * --------------
 * The slug is NOT stored in a wix-data collection. We hand it to the Wix
 * **Embedded Scripts API** (`embeddedScripts.embedScript`), which persists the
 * parameter server-side and associates it with the installed extension. Wix
 * then substitutes it into `script.html` (`{{slug}}`) on every render.
 *
 * `getCurrent()` reads it back via `embeddedScripts.getCurrent()`. This keeps
 * a single source of truth (Wix's embedded-script state) and avoids drift
 * between a collection and what the page actually serves.
 *
 * These run with the elevated permissions of the site owner (web methods run
 * server-side in Velo), so the `embeddedScripts` calls succeed without
 * delegating scopes to the visitor.
 *
 * Docs:
 *   https://dev.wix.com/docs/api-reference/app-management/embedded-scripts/embed-script
 *   https://dev.wix.com/docs/api-reference/app-management/embedded-scripts/get-current
 */
import {embeddedScripts} from "@wix/app-management";
import {Permissions, webMethod} from "@wix/web-methods";

/** The extension id from extensions/embedded-script/config.json. */
const SCRIPT_ID = "convor-widget-loader";

/** Max length for a Convor org slug (mirrors the SaaS validation). */
const SLUG_MAX_LENGTH = 64;

/**
 * Validate a Convor org slug. Returns the cleaned slug or throws.
 *
 * Slugs are lowercase ascii letters, digits, and dashes, e.g. `acme-store`.
 * We intentionally reject anything else so a typo can't ship a broken widget
 * to every page of the merchant's site.
 *
 * @param {unknown} raw
 * @returns {string}
 */
function validateSlug(raw) {
  if (typeof raw !== "string") {
    throw new Error("Slug must be a string.");
  }
  const slug = raw.trim().toLowerCase();
  if (slug.length === 0) {
    throw new Error("Slug is required.");
  }
  if (slug.length > SLUG_MAX_LENGTH) {
    throw new Error(`Slug must be ${SLUG_MAX_LENGTH} characters or fewer.`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(
      "Slug must contain only lowercase letters, numbers, and single dashes " +
        "(e.g. 'acme-store')."
    );
  }
  return slug;
}

/**
 * Read the currently-embedded Convor script, if any.
 *
 * @returns {Promise<{ slug: string } | null>}
 */
async function getSettingsImpl() {
  const current = await embeddedScripts.getCurrent();
  if (!current || current.scriptId !== SCRIPT_ID) {
    return null;
  }
  const slug = current.parameters?.slug ?? "";
  return slug ? {slug} : null;
}

/**
 * Validate and persist the merchant's Convor org slug by (re)embedding the
 * script with the new parameter value.
 *
 * @param {{ slug: string }} input
 * @returns {Promise<{ slug: string }>}
 */
async function saveSettingsImpl(input) {
  const slug = validateSlug(input?.slug);

  // embedScript is idempotent: calling it again with the same scriptId updates
  // the parameters in place (no duplicate script on the site).
  await embeddedScripts.embedScript({
    scriptId: SCRIPT_ID,
    parameters: {slug},
  });

  return {slug};
}

/**
 * Remove the Convor widget from the site entirely (un-embed the script).
 * Called from the dashboard page's "Disconnect" action.
 *
 * @returns {Promise<{ ok: true }>}
 */
async function clearSettingsImpl() {
  const current = await embeddedScripts.getCurrent();
  if (current?.scriptId === SCRIPT_ID) {
    await embeddedScripts.removeScript(SCRIPT_ID);
  }
  return {ok: true};
}

export const getSettings = webMethod(Permissions.Admin, getSettingsImpl);
export const saveSettings = webMethod(Permissions.Admin, saveSettingsImpl);
export const clearSettings = webMethod(Permissions.Admin, clearSettingsImpl);
