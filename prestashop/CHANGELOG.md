# Changelog

## 1.1.0
- Install using the selected website's public widget key or one-time Convor account pairing.
- Verify site ownership with the optional trial challenge.
- Keep each shop's widget settings separate in multistore.
- Optional checkout exclusion, consent-manager integration and product/cart conversation context.
- Prevent a conflicting manual/GTM installation from receiving the module's private product/cart or signed customer context, even when the active widget changes during a request.
- Optional signed pseudonymous customer identity with separate merchant-managed sessions (requires a compatible SDK; disabled by default).
- Verify returning customers and rotated signing keys without colliding with the previous visitor's unique identity or reopening revoked sessions.
- Remove merchant-editable CDN URLs. Existing valid widget keys are migrated; obsolete organization slugs require reconnection.
