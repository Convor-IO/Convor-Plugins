=== Convor Live Chat ===
Contributors: convor
Tags: live chat, chat, chat widget, customer support, woocommerce, ecommerce
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 8.0
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Add the Convor live-chat widget to your WordPress site in under a minute. Install, enter your org slug, done.

== Description ==

Convor is a multi-tenant live-chat platform. This plugin injects the Convor
widget on every page of your WordPress site so visitors can chat with you in
real time.

The widget is a single lightweight `<script>` tag that loads a chat bubble and
an iframe from the Convor CDN. All appearance customization — color,
position, greeting, agent routing, allowed domains — is managed in the
[Convor dashboard](https://convor.io) and fetched at runtime, so the plugin
stays minimal and never goes out of sync.

= Features =

* **One-snippet embed** — injects the canonical Convor widget script into your footer.
* **Settings → Convor** page in wp-admin where you paste your organization slug.
* **WooCommerce aware** — automatically pushes product, price and cart context to the widget on single product pages.
* **Developer friendly** — `convor_widget_config` and `convor_woocommerce_attributes` filters for full control.
* **Privacy aware** — respects the `convor_disable_widget` filter for consent plugins.
* **Clean uninstall** — removes all options when the plugin is deleted.

= How it works =

1. Install the plugin.
2. Sign up at [convor.io](https://convor.io) and copy your Organization Slug from **Settings → Widget**.
3. In WordPress, go to **Settings → Convor**, paste the slug, and save.
4. The chat bubble appears on your site.

== Installation ==

= Automatic installation =

1. In your WordPress admin, go to **Plugins → Add New**.
2. Search for **Convor Live Chat**.
3. Click **Install Now**, then **Activate**.
4. Go to **Settings → Convor**, enter your Organization Slug, and save.

= Manual installation =

1. Upload the `convor` folder to `/wp-content/plugins/`.
2. Activate **Convor Live Chat** from the **Plugins** screen.
3. Go to **Settings → Convor**, enter your Organization Slug, and save.

== Frequently Asked Questions ==

= Where do I find my Organization Slug? =

Sign in to your [Convor dashboard](https://convor.io), open **Settings → Widget**, and copy the public slug. It looks like `my-company`.

= The widget isn't showing up. =

* Confirm the Organization Slug is set and saved in **Settings → Convor**.
* The widget only loads on the public front end, not in the admin area, feeds, REST, or AJAX requests.
* Check the **Allowed Domains** setting in your Convor dashboard — your site domain must be listed.
* If you use a privacy/consent plugin, make sure Convor isn't being suppressed.

= Can I change the widget color or position? =

Those settings live in the Convor dashboard, not in the plugin. Keeping them server-side prevents drift between WordPress and your dashboard configuration.

= Can I disable the widget programmatically? =

Yes — return `true` from the `convor_disable_widget` filter, or override the embed via `convor_widget_config`.

= Is my data removed when I uninstall? =

Yes. Deleting the plugin removes the `convor_settings` option. Deactivating keeps your settings so you can re-enable later.

== Screenshots ==

1. **Settings page** — Configure your Organization Slug and CDN base URL under Settings → Convor.
2. **Widget on a WordPress site** — The Convor chat bubble appears in the corner of every page.
3. **WooCommerce product context** — On product pages the widget receives the current product, price, currency and cart total.

== Changelog ==

= 1.0.0 =
* Initial release.
* Single-script embed of the Convor widget via `wp_footer`.
* Settings API page at **Settings → Convor** for organization slug and CDN base URL.
* WooCommerce integration: pushes `productId`, `productName`, `productPrice`, `currency`, and `cartTotal` on product pages.
* Developer filters: `convor_widget_config`, `convor_woocommerce_attributes`, `convor_disable_widget`.
* Clean uninstall — removes `convor_settings` on deletion.

== Upgrade Notice ==

= 1.0.0 =
Initial release of the Convor Live Chat plugin for WordPress.
