# Convor Live Chat for WordPress

The WordPress plugin connects one site to one website in Convor. Its public widget key is scoped to that website. No WordPress REST API credentials are required for live chat.

## Install

Build the ZIP with `python3 scripts/build-wordpress.py` from the plugin repository root. Upload the generated ZIP using Plugins > Add New > Upload Plugin, activate it, then open Settings > Convor. Choose Connect with Convor, select the appropriate website in the dashboard, and confirm. The alternative is to paste the public `convor_wpk_…` key, enable live chat, and save. Send a visitor message and reply from the inbox.

Do not install the plugin and a manual widget snippet simultaneously. Clear page caches after changing settings. WordPress.org distribution requires directory approval; do not assume the plugin is listed until its approved slug is confirmed.

## Privacy and consent

By default the widget loads only after explicit administrator activation. If visitor opt-in is required, enable Wait for consent before loading Convor and use an opt-in consent manager implementing the WP Consent API (marketing). In the absence of that API the plugin fails closed. A cached site must not use a visitor-specific server-side decision; use the browser consent integration instead.

WooCommerce context is read after widget readiness. Public product metadata is embedded in the page; cart subtotal and currency are read from the browser's own WooCommerce Store API session. No cart line items, order credentials or WordPress passwords are sent by this integration.

## Developer hooks

| Hook | Purpose |
| --- | --- |
| `convor_widget_config` | Trusted PHP override of public key, CDN base, or widget URL. |
| `convor_woocommerce_attributes` | Customize public product attributes. |
| `convor_disable_widget` | Return true to stop loading on this request. |
| `convor_allow_widget` | Return false to block, true to allow explicitly, or null to use the configured consent setting. Only use visitor-specific PHP consent on uncached responses. |

The local test fixture may define `CONVOR_DASHBOARD_URL` and `CONVOR_API_BASE` in trusted PHP. Production uses Convor's HTTPS endpoints.

## Distribution

The plugin is licensed under GPL-2.0-or-later; see [LICENSE](LICENSE). The parent repository's license does not replace the license distributed with this plugin. The ZIP build includes only runtime PHP, JS, translations, readme and license. Follow the release procedure in [RELEASE.md](RELEASE.md).
