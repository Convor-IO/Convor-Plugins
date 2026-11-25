=== Convor Live Chat ===
Contributors: convor
Tags: live chat, chat widget, customer support, woocommerce, chat
Requires at least: 6.0
Tested up to: 7.1
Requires PHP: 8.0
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Add live chat to your WordPress website or WooCommerce store using your Convor account.

== Description ==

Convor lets you chat with visitors from a shared inbox. Connect a website in the Convor dashboard to this plugin, or paste its public widget key manually. Manage the appearance, domain rules and conversations in Convor.

* Connect your website without a WordPress REST API password.
* Select the correct Convor website before authorizing the connection.
* Disable the widget in WordPress without losing your conversations.
* Optionally wait for visitor consent using an opt-in consent manager compatible with the WP Consent API.
* With WooCommerce, share the viewed product and current cart subtotal with Convor. The plugin does not send the contents of the cart, order credentials or WordPress passwords.

A Convor account and an internet connection are required. Convor offers a free plan and paid plans with additional features. See [pricing](https://convor.io/pricing).

== Installation ==

1. Install the Convor Live Chat plugin and activate it.
2. In WordPress, open Settings > Convor.
3. If you require visitor consent, enable the consent setting and save first.
4. Select Connect with Convor, sign in to your account, choose the appropriate website and confirm the connection.
5. Back in WordPress, open your public website and send a test message. Reply from the Convor inbox.

Alternatively, copy the public website widget key (convor_wpk_...) from the Convor dashboard and enter it in Settings > Convor. Enable live chat and save.

== External services ==

This plugin integrates with Convor, an external hosted live-chat service. It does not run a chat server inside WordPress.

* When an administrator chooses Connect with Convor, the browser opens dashboard.convor.io with the WordPress site and callback URLs and temporary authorization parameters. The WordPress server then exchanges the one-time authorization code, state and verifier with api.convor.io for the public widget key. No WordPress password is sent.
* When the widget is enabled (and the selected consent condition permits it), the visitor's browser loads widget resources from cdn.convor.io and connects to the Convor API and real-time messaging service. The service processes information needed to provide live chat, including the website key, page and session information, visitor messages and information visitors choose to share.
* If WooCommerce is active, the plugin reads product information and the cart subtotal and currency using the browser's own shop session. These attributes are sent to Convor with the visitor session.
* Without a configured and enabled widget, this plugin does not load the chat service on public pages.

The site's administrator is responsible for configuring consent and describing the use of live chat to visitors. The optional consent setting uses the marketing category of the WP Consent API in opt-in mode. A compatible consent manager is required for this mode.

Service: https://convor.io/
Terms: https://convor.io/terms
Privacy policy: https://convor.io/privacy

== Frequently Asked Questions ==

= Why is the chat not showing? =

Check that the correct website key is saved, live chat is enabled, the website is allowed in Convor, and the required visitor consent has been granted. Clear your page cache. If Convor requests website verification, copy the data-convor-verification value from the installation code to the optional verification code field and complete verification in Convor.

= Do I need to provide WordPress REST API credentials? =

No. The live chat installation uses the public website widget key. REST API connections are separate integrations.

= Can I customize the widget? =

Yes. Customize your website's widget in the Convor dashboard. The plugin does not maintain a separate set of appearance settings.

= How do I disconnect? =

Clear the website widget key and save, or disable live chat. Deactivating the plugin stops its embed and keeps its settings. Deleting it removes local settings and pending connection data. Conversations remain in Convor. Remove any separately installed theme snippets and clear your page cache.

== Screenshots ==

1. Connect a WordPress site, enter a public widget key or configure visitor consent.
2. Get the installation code for the selected website in the Convor dashboard.
3. Exchange messages with a visitor in the live chat widget.

== Changelog ==

= 1.0.0 =
* Website-specific public widget keys and administrator-authorized pairing.
* Manual widget installation and optional website verification code.
* Consent-aware loading, WordPress script enqueue, and WooCommerce product and cart context.
* Per-site settings and uninstall cleanup.
