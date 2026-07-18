# Convor-Plugins — Agent Knowledge Base

This repo holds installable plugins and SDKs that embed the Convor live-chat
widget on third-party platforms. It's composed into `convor-dev` as a
submodule at `plugins/`.

## Architecture

The Convor widget is a `<script>` tag that injects an iframe + chat bubble,
talking to the Convor REST API and Centrifugo WebSocket. The **only** thing
every plugin needs to do is:

1. Inject `<script src="<apiBase>/widget.js" data-key="<org-slug>" async></script>` into the host page.
2. Provide a settings UI where the merchant enters their org slug (and optionally apiBase).

The embed `<script>` tag also reads optional data attributes that override
specific config values per page. The attribute `data-show-convor-branding`
controls "Powered by Convor" branding visibility (`"false"` hides it, omitting
falls back to the dashboard setting). Free-plan orgs always show branding
regardless of this attribute. The JS equivalent is the `showConvorBranding`
option passed to `initConvor()`.

All appearance config (color, position, greeting, etc.) lives server-side in
the Convor dashboard and is fetched at runtime via
`GET /api/widget/config?key=<slug>`. **Plugins must not duplicate appearance
settings** — they create drift.

## Packages

| Path | Stack | Distribution |
|---|---|---|
| `wordpress/` | PHP (WordPress plugin) | WordPress.org Plugin Directory + WooCommerce |
| `shopify/` | Remix + Theme App Extension | Shopify App Store |
| `sdk/` | TypeScript library | npm `@convor/widget-sdk` |
| `sdk-react/` | React component | npm `@convor/widget-react` |

## Conventions

### Core tenets (apply to every repo — see `convor-dev/AGENTS.md` for canonical)

1. **Aim for the final solution, not MVP/v1.** No half-implementations. If the
   correct solution takes more work, do the work now.
2. **Don't leave things for later.** No `TODO`s, no deferred edge cases, no
   follow-up PRs. Finish completely in this pass.
3. **Don't overcomplicate.** Simplest correct design (KISS/YAGNI). No
   speculative abstraction or config.
4. **Breaking changes are welcome — no backward-compat planning.** This project
   is not in production. Prefer clean rewrites over compatibility. No
   deprecation paths, migration bridges, compat shims, or temporary fallbacks
   added solely to preserve old behavior.
5. **Worktree-first.** Real changes happen in `.worktrees/` branches off the
   default branch (`main` here). Trivial docs/typo fixes may go straight to
   `main`. When green, open a PR into `main` by default; the user merges.
   Agents don't self-merge unless explicitly asked.
6. **Don't double-run the gate.** This repo has husky hooks — don't manually
   re-run the repo-wide check a hook already runs for your change. Commit/push
   and let the hook run it. Targeted checks while iterating are fine.
   - **pre-commit** runs `pnpm nano-staged` (biome on staged TS/JS files).
   - **pre-push** runs `pnpm gate` (= `lint && typecheck && test` — the 12
     integration suites under `integration-tests/` cover the PHP plugins via
     JS-driven snippet assertions; biome does not lint PHP).
7. **Keep responses short.** State what you did and what's next — no preamble,
   no restating the request, no filler.
8. **Idiomatic, sense-for-sense translation — n/a here.** Plugins inject the
   canonical embed snippet and expose settings UIs; they carry no user-visible
   strings of their own to localize (the widget's strings are owned by the SaaS
   i18n packages).

### Repo-specific

- **Biome** for lint/format on TS packages (mirrors the broader Convor
  conventions: 80-char width, double quotes, 2-space indent, semicolons).
  WordPress PHP follows WordPress coding standards.
- **Conventional Commits** with scope, e.g.
  `feat(shopify): app embed block + settings page`.
- **No `as any` / `@ts-ignore`** in TS packages.

## Key references (in the SaaS repo)

- Widget embed loader: `saas/apps/widget/src/embed.ts`
- Visitor token endpoint: `POST /api/auth/visitor-token` (accepts `{slug}`)
- Public config endpoint: `GET /api/widget/config?key=<slug>`
- Per-widget allowed-domains: `widget_configs.allowed_domains` (enforced in
  both endpoints above — merchants can restrict where their widget embeds)

## Production endpoints

- Widget script: `https://cdn.convor.io/widget.js` (and `/widget-iframe.html`)
- REST API base: `https://api.convor.io` (or the same host as the dashboard)

> Note: these hostnames are placeholders pending the production CDN launch.
> Plugins read `apiBase` from a constant that can be overridden per-build.
