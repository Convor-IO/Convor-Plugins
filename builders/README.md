# Convor website-builder integrations

Copy-paste guides for embedding the [Convor](https://convor.io) live-chat
widget on the major hosted website builders. These builders don't have a real
"install plugin" marketplace for custom widgets — they all expose a **Custom
Code** panel, so each guide walks through pasting the canonical Convor snippet.

| Builder | Where to paste | Plan required | Guide |
|---|---|---|---|
| **Webflow** | Site settings → Custom code → Footer code | Any paid site plan | [`webflow/`](./webflow) |
| **Framer** | Site Settings → Custom Code → End of `<body>` tag | Any paid plan | [`framer/`](./framer) |
| **Squarespace** | Settings → Advanced → Code Injection → Footer | Business / Commerce (not Personal) | [`squarespace/`](./squarespace) |
| **Duda** | Site → Settings → Custom Code → Body-end HTML | Team plan or higher | [`duda/`](./duda) |

## The snippet

Every builder uses the same one-line loader, sourced from the Convor CDN:

```html
<script src="https://cdn.convor.io/widget.js" data-key="YOUR_ORG_SLUG" async></script>
```

`data-key` is your organization's public slug (visible in the Convor dashboard
under **Settings → Widget**). All appearance customization — color, position,
greeting, hours — is fetched at runtime from the Convor API, so the snippet
stays minimal. **Do not duplicate appearance settings in each builder** — it
creates drift.

## Per-builder layout

Each `builders/<builder>/` folder contains:

```
<builder>/
├── README.md       # copy-paste-ready install guide
└── snippet.html    # standalone snippet with YOUR_ORG_SLUG placeholder
```

> `screenshots/` are TBD — none are fabricated here.

## License

MIT
