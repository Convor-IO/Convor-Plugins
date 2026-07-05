/**
 * Wix app manifest — self-managed Wix app for the Convor live-chat widget.
 *
 * This is the config the Wix CLI reads. Run `wix dev` against a site, then
 * `wix app deploy` to push the app (and its embedded-script extension) to your
 * Wix Developers workspace for App Market submission.
 *
 * Docs:
 *   https://dev.wix.com/docs/build-apps/develop-your-app/develop-a-self-managed-app/develop-a-self-managed-app-with-the-cli
 *
 * The merchant-facing behaviour is intentionally tiny: a single Embedded
 * Script extension that drops the Convor widget loader into the site DOM, plus
 * a dashboard page (in `settings-panel/`) where the merchant enters their
 * Convor org slug. All appearance config lives server-side in Convor.
 */
import type { WixAppConfig } from "@wix/cli-app";

const config: WixAppConfig = {
  appId: process.env.WIX_APP_ID,
  name: "Convor Live Chat",
  description:
    "Add the Convor live-chat widget to your Wix site. Enter your " +
    "Convor org slug and the chat bubble appears on every page — colors, " +
    "position, and greetings are managed in your Convor dashboard.",
  // Self-managed apps are deployed via the Wix CLI and reviewed against the
  // App Market Guidelines.
  managedType: "self",

  extensions: [
    {
      type: "embedded-script",
      // Path is relative to this file. `wix dev` watches it for changes.
      entry: "./extensions/embedded-script",
    },
    {
      type: "dashboard-page",
      entry: "./settings-panel",
    },
  ],
};

export default config;
