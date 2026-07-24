___TERMS_OF_SERVICE___

By creating or modifying this file you agree to Google Tag Manager's Community
Template Gallery Developer Terms of Service available at
https://developers.google.com/tag-manager/gallery-tos (or such other URL as
Google may provide), as modified from time to time.



___INFO___

{
  "type": "TAG",
  "id": "cvt_temp_public_id",
  "version": 1,
  "securityGroups": [],
  "displayName": "Convor Widget",
  "categories": ["MARKETING", "UTILITY"],
  "brand": {
    "id": "brand_dummy",
    "displayName": "Convor",
    "thumbnail": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PGNpcmNsZSBjeD0iMzIiIGN5PSIzMiIgcj0iMzAiIGZpbGw9IiM0MzY2ZjUiLz48cGF0aCBkPSJNMTkgMjZoMjZhNiA2IDAgMCAxIDYgNnY5YTYgNiAwIDAgMS02IDZIMzVsLTkgOHYtOEgxOWE2IDYgMCAwIDEtNi02di05YTYgNiAwIDAgMSA2LTZ6IiBmaWxsPSIjZmZmIi8+PC9zdmc+"
  },
  "description": "Inject the Convor live-chat widget onto your site. Enter your Convor organization slug and the widget loads from the Convor CDN — no developer required.",
  "containerContexts": ["WEB"]
}


___TEMPLATE_PARAMETERS___

[
  {
    "type": "LABEL",
    "name": "intro",
    "displayName": "\u003cstrong\u003eConvor Widget\u003c/strong\u003e loads the Convor live-chat widget from the Convor CDN. Enter your organization slug below (find it in the Convor dashboard under \u003cstrong\u003eSettings \u2192 Widget\u003c/strong\u003e)."
  },
  {
    "type": "TEXT",
    "name": "orgSlug",
    "displayName": "Organization slug",
    "simpleValueType": true,
    "help": "Your Convor organization slug (find it in Settings \u2192 Widget). Example: \u003ccode\u003eacme-store\u003c/code\u003e. Lowercase letters, numbers, and dashes.",
    "valueValidators": [
      {
        "type": "NON_EMPTY"
      },
      {
        "type": "REGEX",
        "args": [
          "^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$"
        ]
      }
    ]
  },
  {
    "type": "TEXT",
    "name": "apiBase",
    "displayName": "Widget script base URL",
    "simpleValueType": true,
    "help": "Widget script base URL. Leave blank for the production default (\u003ccode\u003ehttps://cdn.convor.io\u003c/code\u003e).",
    "valueValidators": [
      {
        "type": "REGEX",
        "args": [
          "^https?://[^/]+.*$"
        ]
      }
    ]
  },
  {
    "type": "GROUP",
    "name": "appearance",
    "displayName": "Appearance overrides (optional)",
    "groupStyle": "ZIPPY_CLOSED",
    "help": "Appearance is normally managed in the Convor dashboard (Settings \u2192 Widget) and fetched at runtime. Set values here only to override the dashboard on a per-tag basis.",
    "subParams": [
      {
        "type": "TEXT",
        "name": "primaryColor",
        "displayName": "Primary color",
        "simpleValueType": true,
        "help": "Override the chat bubble / accent color. Hex color, e.g. \u003ccode\u003e#4366f5\u003c/code\u003e. Leave blank to use the dashboard value."
      },
      {
        "type": "SELECT",
        "name": "position",
        "displayName": "Position",
        "macrosInSelect": false,
        "selectItems": [
          {
            "value": "",
            "displayValue": "Use dashboard default"
          },
          {
            "value": "bottom-right",
            "displayValue": "Bottom right"
          },
          {
            "value": "bottom-left",
            "displayValue": "Bottom left"
          }
        ],
        "simpleValueType": true,
        "help": "Override the bubble position. Leave as default to use the dashboard value."
      },
      {
        "type": "SELECT",
        "name": "theme",
        "displayName": "Theme",
        "macrosInSelect": false,
        "selectItems": [
          {
            "value": "",
            "displayValue": "Use dashboard default"
          },
          {
            "value": "light",
            "displayValue": "Light"
          },
          {
            "value": "dark",
            "displayValue": "Dark"
          },
          {
            "value": "auto",
            "displayValue": "Auto (follow OS)"
          }
        ],
        "simpleValueType": true,
        "help": "Override the widget theme. Leave as default to use the dashboard value."
      }
    ]
  }
]


___SANDBOXED_JS_FOR_WEB_TEMPLATE___

// Convor Widget — GTM custom template.
//
// The canonical Convor snippet is:
//
//     <script src="https://cdn.convor.io/widget.js"
//             data-key="ORG_SLUG" async></script>
//
// The widget loader (embed.ts → resolveConfig) reads the org slug from
// EXACTLY one place on the host page: the data-key / data-org attribute on
// its own <script> tag (or an explicit Convor.init({ key }) call). It
// does NOT read ?key= query params, and it does NOT read a window.ConvorConfig
// global — so a template that relies on those will load widget.js but the
// widget will throw `"key" is required` and never mount.
//
// GTM's sandboxed `injectScript(url, onSuccess, onFailure)` can load a script
// from a URL but CANNOT attach data-* attributes to the injected <script>.
// So we use the widget's other supported entry point: after the script loads
// (onSuccess), we call its public API `window.Convor.init({ key, ... })`
// via `callInWindow`. That is the same code path the widget's own auto-init
// takes when data-key IS present, so behaviour is identical to the canonical
// snippet.
//
// Optional appearance overrides (primaryColor / position / theme) are passed
// straight through to init(); when left blank the widget fetches the values
// configured in the Convor dashboard.

const injectScript = require('injectScript');
const callInWindow = require('callInWindow');
const copyFromWindow = require('copyFromWindow');
const log = require('logToConsole');
const getType = require('getType');

// ---- Helpers ---------------------------------------------------------------

// GTM template fields are not guaranteed to be strings (a variable may
// resolve to a number / undefined). Normalise defensively.
const toStr = (val) => (getType(val) === 'string' ? val : val == null ? '' : '' + val);

// Build the init() options object. `key` is always present; the appearance
// keys are only included when actually set, so the widget falls back to the
// dashboard value for any that are omitted.
const buildInitOptions = (orgSlug) => {
  const opts = { key: orgSlug };
  if (toStr(data.primaryColor).trim()) {
    opts.primaryColor = toStr(data.primaryColor).trim();
  }
  if (toStr(data.position).trim()) {
    opts.position = toStr(data.position).trim();
  }
  if (toStr(data.theme).trim()) {
    opts.theme = toStr(data.theme).trim();
  }
  return opts;
};

// ---- main code() -----------------------------------------------------------
//
// GTM runs whatever top-level statements this section contains. We wrap the
// logic in a `code()` function and invoke it once at the bottom.

const code = () => {
  const orgSlug = toStr(data.orgSlug).trim();
  const apiBase = (toStr(data.apiBase).trim() || 'https://cdn.convor.io')
    .replace(/\/+$/, ''); // strip trailing slashes

  // Guard: a slug is mandatory. Non-empty is also enforced by the field
  // validator, but we double-check in case a variable resolved to blank.
  if (!orgSlug) {
    log('Convor: org slug is empty — widget not loaded.');
    data.gtmOnFailure();
    return;
  }

  // Clean canonical URL — NO ?key= query param (the widget ignores it, and a
  // bare URL lets GTM dedupe against any canonical snippet already on the
  // page so we don't double-load widget.js).
  const src = apiBase + '/widget.js';

  // If the merchant's page already initialised Convor (e.g. they have the
  // canonical snippet AND this tag), don't fight it — report success and
  // leave the existing instance alone.
  const alreadyLoaded = copyFromWindow('Convor');
  if (alreadyLoaded && getType(alreadyLoaded.init) === 'function') {
    log('Convor: window.Convor already present on the page — skipping inject.');
    data.gtmOnSuccess();
    return;
  }

  const onFailure = () => {
    log('Convor: widget script failed to load from ' + src);
    data.gtmOnFailure();
  };

  // Once widget.js has loaded it registers window.Convor. We then call its
  // public init({ key, ... }) — the supported equivalent of data-key.
  const onSuccess = () => {
    const Convor = copyFromWindow('Convor');
    if (!Convor || getType(Convor.init) !== 'function') {
      log('Convor: widget.js loaded but window.Convor.init is missing — '
          + 'the script may have failed to parse. Tag will not fire init.');
      data.gtmOnFailure();
      return;
    }
    callInWindow('Convor.init', buildInitOptions(orgSlug));
    data.gtmOnSuccess();
  };

  // Inject the widget script asynchronously. GTM deduplicates by URL.
  injectScript(src, onSuccess, onFailure, 'async');
};

// Run it.
code();


___WEB_PERMISSIONS___

[
  {
    "instance": {
      "key": {
        "publicId": "inject_script",
        "versionId": "1"
      },
      "param": [
        {
          "key": "urls",
          "value": {
            "type": 2,
            "listItem": [
              {
                "type": 1,
                "string": "https://cdn.convor.io/*"
              },
              {
                "type": 1,
                "string": "https://*.convor.io/*"
              }
            ]
          }
        }
      ]
    },
    "clientAnnotations": {
      "isEditedByUser": true
    },
    "isRequired": true
  },
  {
    "instance": {
      "key": {
        "publicId": "access_globals",
        "versionId": "1"
      },
      "param": [
        {
          "key": "keys",
          "value": {
            "type": 2,
            "listItem": [
              {
                "type": 3,
                "mapKey": [
                  { "type": 1, "string": "key" },
                  { "type": 1, "string": "read" },
                  { "type": 1, "string": "write" },
                  { "type": 1, "string": "execute" }
                ],
                "mapValue": [
                  { "type": 1, "string": "Convor" },
                  { "type": 8, "boolean": true },
                  { "type": 8, "boolean": false },
                  { "type": 8, "boolean": false }
                ]
              },
              {
                "type": 3,
                "mapKey": [
                  { "type": 1, "string": "key" },
                  { "type": 1, "string": "read" },
                  { "type": 1, "string": "write" },
                  { "type": 1, "string": "execute" }
                ],
                "mapValue": [
                  { "type": 1, "string": "Convor.init" },
                  { "type": 8, "boolean": false },
                  { "type": 8, "boolean": false },
                  { "type": 8, "boolean": true }
                ]
              }
            ]
          }
        }
      ]
    },
    "clientAnnotations": {
      "isEditedByUser": true
    },
    "isRequired": true
  },
  {
    "instance": {
      "key": {
        "publicId": "logging",
        "versionId": "1"
      },
      "param": [
        {
          "key": "environments",
          "value": {
            "type": 1,
            "string": "debug"
          }
        }
      ]
    },
    "clientAnnotations": {
      "isEditedByUser": true
    },
    "isRequired": true
  }
]


___TESTS___

scenarios: []


___NOTES___

Convor live-chat widget — GTM custom tag template.

Semantically injects `<script src="https://cdn.convor.io/widget.js"
data-key="SLUG" async>`. GTM's sandboxed `injectScript` API cannot attach
data-* attributes to the injected tag, and the widget loader reads the org
slug ONLY from the data-key attribute (or an explicit Convor.init call)
— it does NOT honor ?key= query params or a window.ConvorConfig global. So
this template loads widget.js with a clean URL and then calls the widget's
public `window.Convor.init({ key, ... })` API from the script's
onSuccess callback (via callInWindow). That is the same code path the widget's
own auto-init takes when data-key IS present, so end-user behaviour matches
the canonical snippet exactly.

Optional appearance overrides (primaryColor / position / theme) are passed
straight to init(); when omitted, the widget uses the values configured in the
Convor dashboard (Settings → Widget).

Created 2026-07-05.
