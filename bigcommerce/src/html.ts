/**
 * HTML escaping + minimal HTML document builder. All user-supplied values
 * are interpolated through `escapeHtml` / `escapeAttr`; numeric values are
 * stringified and never reflect raw input.
 */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escape a string for use in HTML text content or a double-quoted attribute. */
export function escapeHtml(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  return str.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

/** Escape a value for safe inclusion inside a `<script type="application/json">`. */
export function escapeJsonScript(value: unknown): string {
  // For JSON-in-script we only need to neutralise the closing-sequence risk.
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

interface PageInput {
  title: string;
  body: string;
}

/** Wrap body HTML in a minimal HTML5 shell. */
export function htmlPage({title, body}: PageInput): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${BASE_STYLES}</style>
</head>
<body>
${body}
</body>
</html>`;
}

export const BASE_STYLES = `
  :root {
    --bg: #f6f7f9;
    --panel: #ffffff;
    --border: #e1e4e8;
    --text: #1d2129;
    --muted: #5f6b7a;
    --brand: #4f46e5;
    --brand-hover: #4338ca;
    --danger: #b91c1c;
    --ok: #15803d;
    --radius: 10px;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .wrap { max-width: 720px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 24px 0 8px; }
  p { margin: 0 0 12px; color: var(--muted); }
  a { color: var(--brand); }
  .card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 24px;
    margin-top: 16px;
  }
  label { display: block; font-weight: 600; margin: 16px 0 6px; }
  input[type="text"], input[type="url"] {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    font: inherit;
    background: #fff;
  }
  input[type="text"]:focus, input[type="url"]:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);
  }
  .help { font-size: 13px; color: var(--muted); margin-top: 6px; }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    border: 0;
    border-radius: 8px;
    background: var(--brand);
    color: #fff;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
  }
  .btn:hover { background: var(--brand-hover); }
  .btn:disabled { opacity: 0.6; cursor: default; }
  .btn-secondary { background: #fff; color: var(--text); border: 1px solid var(--border); }
  .btn-secondary:hover { background: #f0f1f3; }
  .row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
  .actions { margin-top: 24px; display: flex; gap: 12px; }
  .banner {
    padding: 12px 14px;
    border-radius: 8px;
    margin-bottom: 16px;
    font-size: 14px;
  }
  .banner-error { background: #fee2e2; color: var(--danger); border: 1px solid #fecaca; }
  .banner-ok { background: #dcfce7; color: var(--ok); border: 1px solid #bbf7d0; }
  .status-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .status-on { background: var(--ok); }
  .status-off { background: #d1d5db; }
  code { background: #eef0f3; padding: 1px 5px; border-radius: 4px; font-size: 13px; }
  pre {
    background: #0f172a; color: #e2e8f0; padding: 14px; border-radius: 8px;
    overflow-x: auto; font-size: 13px;
  }
  .muted { color: var(--muted); }
  .center { text-align: center; }
`;
