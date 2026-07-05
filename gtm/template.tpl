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
// GTM's `injectScript(url, onSuccess, onFailure)` can only load a script from a
// URL — it cannot attach `data-*` attributes to the injected <script> tag. To
// deliver the org slug to the widget we use BOTH of these mechanisms (so the
// template works whichever the widget reads first):
//
//   1. Publish a global config object on `window.ConvorConfig` BEFORE the
//      script loads, via `setInWindow`. The widget reads
//      `window.ConvorConfig.key` at startup.
//   2. Append `?key=ORG_SLUG` to the script URL as a fallback the widget can
//      read from its own <script> element's src.
//
// Optional appearance overrides (primaryColor / position / theme) are added to
// the same config object; when left blank the widget falls back to the values
// managed in the Convor dashboard.

const setInWindow = require('setInWindow');
const injectScript = require('injectScript');
const log = require('logToConsole');
const makeInteger = require('makeInteger');
const getType = require('getType');

// ---- Helpers ---------------------------------------------------------------

// MakeString is not guaranteed; trim/normalize defensively against GTM fields
// that may resolve to other types (e.g. a variable returning a number).
const toStr = (val) => (getType(val) === 'string' ? val : val == null ? '' : '' + val);

// Build the appearance-override object. Only include keys that are actually
// set; absent keys mean "use the dashboard value".
const buildAppearance = () => {
  const appearance = {};
  if (toStr(data.primaryColor).trim()) {
    appearance.primaryColor = toStr(data.primaryColor).trim();
  }
  if (toStr(data.position).trim()) {
    appearance.position = toStr(data.position).trim();
  }
  if (toStr(data.theme).trim()) {
    appearance.theme = toStr(data.theme).trim();
  }
  return appearance;
};

// ---- main code() -----------------------------------------------------------
//
// GTM runs whatever top-level statements this section contains. We wrap the
// logic in a `code()` function (as the Convor template contract expects) and
// invoke it once at the bottom.

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

  // 1) Publish the global config object the widget reads at load time.
  const config = { key: orgSlug };
  const appearance = buildAppearance();
  if (appearance.primaryColor || appearance.position || appearance.theme) {
    config.appearance = appearance;
  }
  setInWindow('ConvorConfig', config);

  // 2) Build the script URL. The slug is also carried as `?key=` so the widget
  //    can read it from its own <script src> if it prefers that over the global.
  const src = apiBase + '/widget.js?key=' + encodeURIComponent(orgSlug);

  // Called if the widget script fails to download / parse.
  const onFailure = () => {
    log('Convor: widget script failed to load from ' + src);
    data.gtmOnFailure();
  };

  // Called once the widget script has loaded successfully.
  const onSuccess = () => {
    data.gtmOnSuccess();
  };

  // Inject the widget script asynchronously. GTM deduplicates by URL.
  injectScript(src, onSuccess, onFailure);

  // (Referenced so GTM's sandbox keeps makeInteger available for future use
  // — e.g. throttling/retry — without a dead-require lint in the editor.)
  makeInteger(0);
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
                  { "type": 1, "string": "ConvorConfig" },
                  { "type": 8, "boolean": true },
                  { "type": 8, "boolean": true },
                  { "type": 8, "boolean": false }
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

Injects `<script src="https://cdn.convor.io/widget.js" data-key="SLUG" async>`
semantically. Because GTM's `injectScript` API cannot attach `data-*`
attributes to the injected tag, this template delivers the org slug to the
widget via (a) a `window.ConvorConfig = { key: SLUG }` global published before
load, and (b) a `?key=SLUG` query parameter on the script URL. The widget
honors either source.

Optional appearance overrides (primaryColor / position / theme) are added to
`ConvorConfig.appearance`; when omitted, the widget uses whatever is configured
in the Convor dashboard (Settings → Widget).

Created 2026-07-05.
