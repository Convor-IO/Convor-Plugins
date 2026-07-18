import {CONVOR_DASHBOARD_URL} from "./config.js";

/**
 * The merchant-facing Convor widget config. Stored verbatim as the value of
 * the `convor.widget` store metafield, and rendered into the storefront
 * script's `data-key` attribute.
 */
export interface ConvorWidgetConfig {
  slug: string;
  apiBase: string;
}

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export function emptyConfig(defaultApiBase: string): ConvorWidgetConfig {
  return {slug: "", apiBase: defaultApiBase};
}

export function isConvorWidgetConfig(
  value: unknown
): value is ConvorWidgetConfig {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.slug === "string" && typeof v.apiBase === "string";
}

/** Parse a metafield value string into a config, falling back to defaults. */
export function parseConfig(
  raw: string | null | undefined,
  defaultApiBase: string
): ConvorWidgetConfig {
  if (!raw) return emptyConfig(defaultApiBase);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isConvorWidgetConfig(parsed)) {
      return {
        slug: parsed.slug,
        apiBase: parsed.apiBase || defaultApiBase,
      };
    }
  } catch {
    // fall through to default
  }
  return emptyConfig(defaultApiBase);
}

export interface ValidationError {
  field: "slug" | "apiBase";
  message: string;
}

/** Validate user input before persisting. Returns [] on success. */
export function validateConfig(
  slug: string,
  apiBase: string,
  defaultApiBase: string
): ValidationError[] {
  const errors: ValidationError[] = [];
  const trimmedSlug = slug.trim();
  if (!trimmedSlug) {
    errors.push({
      field: "slug",
      message: "Please enter your Convor org slug.",
    });
  } else if (!SLUG_PATTERN.test(trimmedSlug)) {
    errors.push({
      field: "slug",
      message:
        "Slug must be lowercase letters, numbers, and dashes (max 64 chars).",
    });
  }
  const trimmedBase = apiBase.trim() || defaultApiBase;
  try {
    const url = new URL(trimmedBase);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("bad protocol");
    }
  } catch {
    errors.push({field: "apiBase", message: "API base must be a valid URL."});
  }
  return errors;
}

/** Build the exact `<script>` tag injected into the storefront. */
export function buildWidgetHtml(cfg: ConvorWidgetConfig): string {
  const src = `${cfg.apiBase.replace(/\/+$/, "")}/widget.js`;
  // data-key uses double quotes inside an HTML attribute; slug is validated
  // to be [a-z0-9-] so no escaping is needed here.
  return [
    "<script>",
    "(function(){",
    `var script=document.createElement("script");`,
    `script.src=${JSON.stringify(src)};`,
    `script.setAttribute("data-key",${JSON.stringify(cfg.slug)});`,
    "script.async=true;",
    "(document.head||document.documentElement).appendChild(script);",
    "})();",
    "</script>",
  ].join("");
}

export {CONVOR_DASHBOARD_URL};
