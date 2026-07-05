/**
 * Page-side widget injector.
 *
 * The function {@link injectConvorWidget} is the page-side counterpart of the
 * Convor embed snippet: it inserts the canonical
 * `<script src="<apiBase>/widget.js" data-key="<slug>" async>` tag into the
 * host page. It is shipped to the page via `chrome.scripting.executeScript`
 * (from the popup on "Inject now" and from the background worker for
 * auto-inject), evaluated in the page's main world with `apiBase`/`slug` as
 * function args.
 *
 * We deliberately do NOT register a static `content_scripts` entry in the
 * manifest: host permissions are dynamic (the user opts in per site), so a
 * static content script would either need `<all_urls>` (review friction) or
 * couldn't match user-added hosts. `executeScript` + activeTab / optional host
 * permissions keeps the install-time permission set minimal.
 *
 * This file is bundled as an IIFE so it can also be loaded directly as a
 * content script if a future build wants that path; its only export is the
 * injector function.
 */

/**
 * Inject the Convor widget embed script into the current page.
 *
 * Self-contained: no closure variables, no imports, no external references —
 * Chrome serializes the function source and re-evaluates it in the page's main
 * world, so anything not defined inline would be `undefined` at runtime.
 *
 * Injects into `document.head`, falling back to `document.documentElement`.
 * Skips the inject if a Convor script (either a site-owned embed or one this
 * extension already added) is already present, so repeated clicks are safe.
 *
 * @returns `true` if the script tag was added, `false` if it was already there.
 */
export function injectConvorWidget(apiBase: string, slug: string): boolean {
  const base = (apiBase || "https://cdn.convor.io").replace(/\/+$/, "");
  const src = `${base}/widget.js`;
  const existing = document.querySelector<HTMLScriptElement>(
    `script[data-convor="extension"], script[src="${src}"]`,
  );
  if (existing) {
    return false;
  }
  const script = document.createElement("script");
  script.src = src;
  // Set the async attribute explicitly so the injected tag matches the
  // canonical Convor snippet (`<script ... async>`) and survives
  // serialization. (Dynamically-created scripts are async-by-default per
  // the HTML spec, so `script.async = true` alone is functionally correct —
  // but the explicit attribute is self-documenting and the form every other
  // plugin emits.)
  script.setAttribute("async", "");
  script.setAttribute("data-key", slug);
  script.setAttribute("data-convor", "extension");
  (document.head || document.documentElement).appendChild(script);
  return true;
}
