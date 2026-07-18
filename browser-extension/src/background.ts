import {injectConvorWidget} from "./content-script";
/**
 * MV3 background service worker.
 *
 * Responsibilities:
 *  - On first install, open the options page so the user can configure their
 *    org slug. If a slug is already configured (e.g. signed-in sync), skip.
 *  - On startup (and whenever settings change), reconcile the static
 *    `content_scripts`-equivalent behaviour via optional host permissions:
 *    we don't ship a static content script (host permissions are dynamic), so
 *    auto-inject instead runs from the popup's activeTab grant + this worker's
 *    `chrome.tabs.onUpdated` listener on sites the user has explicitly opted
 *    into (matches `allowedSites`).
 */
import {getSettings, isSlugValid, matchesAllowedSites} from "./shared";

/**
 * Auto-inject on navigation, but only on hosts the user has explicitly allow-
 * listed AND only once a host permission exists for that tab. We can't inject
 * without a grant; if the user opted in via the popup we already requested the
 * origin, so this catches subsequent navigations on the same host.
 */
async function maybeAutoInject(
  tabId: number,
  tabUrl: string | undefined
): Promise<void> {
  if (!tabUrl || !/^https?:/.test(tabUrl)) return;
  const settings = await getSettings();
  if (!settings.autoInject || !isSlugValid(settings.orgSlug)) return;
  if (!matchesAllowedSites(tabUrl, settings.allowedSites)) return;

  try {
    await chrome.scripting.executeScript({
      target: {tabId},
      func: injectConvorWidget,
      args: [settings.apiBase, settings.orgSlug.trim()],
    });
  } catch {
    // Most likely a host we don't have permission for (the user hasn't opted
    // this site in yet) or a chrome:// page. Silently ignore — the popup
    // offers an explicit "Inject now" for the manual case.
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason !== "install") return;

  const settings = await getSettings();
  if (!isSlugValid(settings.orgSlug)) {
    await chrome.runtime.openOptionsPage();
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, change, tab) => {
  // Only act on full document loads to avoid injecting multiple times.
  if (change.status !== "complete") return;
  await maybeAutoInject(tabId, tab.url);
});
