/**
 * Behavioral contract of the module, running PHP with platform shims.
 * Real ZIP installation, Smarty, admin ACL and messaging are separate browser QA.
 */
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { assertSnippetMatches } = require("./assert-snippet");

const KEY = "convor_wpk_" + "a".repeat(64);
const OTHER = "convor_wpk_" + "b".repeat(64);
const CHALLENGE = "challenge_Example-123";
const CDN = "https://cdn.convor.io";
const good = {
  enabled: true,
  widget_key: KEY,
  verification_challenge: CHALLENGE,
};

function run(settings, options = {}) {
  return JSON.parse(
    execFileSync("php", [path.join(__dirname, "_ps-harness.php")], {
      encoding: "utf8",
      env: {
        ...process.env,
        CONVOR_TEST_SCENARIO: JSON.stringify({ settings, ...options }),
      },
    }),
  );
}

// The PS8 Symfony configuration endpoint redirects to legacy BO and drops POST.
// Form actions must land directly at the appropriate version-specific controller.
assert.match(
  run({ 1: good }, { version: "8.2.9", routeTest: true }).formAction,
  /controller=AdminModules&configure=convor/,
);
assert.match(
  run({ 1: good }, { version: "9.2.1", routeTest: true }).formAction,
  /action\/configure\/convor/,
);
const active = run({ 1: good, 2: { ...good, widget_key: OTHER } });
assertSnippetMatches(active.html, { apiBase: CDN, slug: KEY });
assert.match(active.html, /data-convor-verification="challenge_Example-123"/);
assertSnippetMatches(
  run({ 1: good, 2: { ...good, widget_key: OTHER } }, { shop: 2 }).html,
  {
    apiBase: CDN,
    slug: OTHER,
  },
);
assert.equal(run({ 1: good }, { shop: 2 }).html.trim(), "");
assert.equal(run({ 1: { ...good, enabled: false } }).html.trim(), "");
assert.equal(run({ 1: { ...good, widget_key: "acme" } }).html.trim(), "");
assert.equal(
  run({ 1: { ...good, widget_key: KEY + '"><script>' } }).html.trim(),
  "",
);
assert.equal(
  run(
    {},
    { legacy: { CONVOR_ORG_SLUG: "acme", CONVOR_ENABLED: 1 } },
  ).html.trim(),
  "",
);
assert.equal(
  run(
    { 1: { ...good, exclude_checkout: true } },
    { page: "order" },
  ).html.trim(),
  "",
);
const gated = run({ 1: { ...good, consent_required: true } });
assert.doesNotMatch(
  gated.html,
  /\ssrc="https:\/\/cdn\.convor\.io\/widget\.js"/,
);
assert.match(
  gated.html,
  /data-convor-src="https:\/\/cdn\.convor\.io\/widget\.js"/,
);
assert.match(gated.html, /data-key="convor_wpk_/);
const unsafe = run(
  { 1: good },
  { legacy: { CONVOR_API_BASE: "https://evil.invalid" } },
);
assertSnippetMatches(unsafe.html, { apiBase: CDN, slug: KEY });
assert.doesNotMatch(unsafe.html, /evil\.invalid/);
// Even trusted deployment configuration must fail closed on a typo or
// noncanonical origin; it must never emit attacker-controlled script URLs.
for (const cdn of [
  "https://evil.invalid",
  "https://cdn.convor.io.evil.invalid",
  "https://cdn.convor.io@evil.invalid",
  "https://cdn.convor.io/?redirect=evil",
  "https://cdn.convor.io/#fragment",
  "http://cdn.convor.io",
  "javascript:alert(1)",
  "http://localhost:17243",
]) {
  const rejected = run({ 1: good }, { endpoints: { cdn } });
  assert.equal(rejected.html.trim(), "", cdn);
  assert.equal(rejected.endpoints.cdn, "", cdn);
}
const local = run(
  { 1: good },
  {
    localQa: true,
    endpoints: {
      cdn: "http://localhost:17243",
      api: "http://server:3000",
      dashboard: "http://localhost:17244",
    },
  },
);
assertSnippetMatches(local.html, {
  apiBase: "http://localhost:17243",
  slug: KEY,
});
assert.equal(local.endpoints.api, "http://server:3000");
assert.equal(local.endpoints.dashboard, "http://localhost:17244");
assert.equal(
  run(
    { 1: good },
    { localQa: true, endpoints: { api: "http://169.254.169.254" } },
  ).endpoints.api,
  "",
);
assert.equal(
  active.repeatHtml.trim(),
  "",
  "Repeated displayHeader call must not duplicate the loader",
);

const edited = run(
  { 1: good, 2: { ...good, widget_key: OTHER } },
  {
    post: {
      widget_key: OTHER,
      enabled: "1",
      verification_challenge: CHALLENGE,
    },
  },
);
assert.equal(edited.settings[1].widget_key, OTHER);
assert.equal(edited.settings[1].verification_challenge, "");
assert.equal(edited.settings[2].widget_key, OTHER);
const named = { ...good, website_name: "Paired website" };
const changed = run(
  { 1: named },
  { post: { widget_key: OTHER, enabled: "1" } },
);
assert.equal(
  changed.settings[1].website_name,
  "",
  "Changing key must forget the last paired label",
);
const unchanged = run(
  { 1: named },
  { post: { widget_key: KEY, enabled: "1" } },
);
assert.equal(unchanged.settings[1].website_name, "Paired website");
const rejected = run(
  { 1: good },
  { post: { widget_key: ["bad"], enabled: "1" } },
);
assert.deepEqual(rejected.settings[1], good);
const forbidden = run(
  { 1: good },
  { post: { widget_key: OTHER, enabled: "1" }, invalidToken: true },
);
assert.deepEqual(forbidden.settings[1], good);
// PS 9 Symfony randomizes the serialized CSRF token on every request.
const masked = run(
  { 1: good },
  { maskedToken: true, post: { widget_key: OTHER, enabled: "1" } },
);
assert.equal(masked.settings[1].widget_key, OTHER);
const forged = run(
  { 1: good },
  {
    maskedToken: true,
    invalidToken: true,
    post: { widget_key: OTHER, enabled: "1" },
  },
);
assert.deepEqual(forged.settings[1], good);
const group = run(
  { 1: good },
  { post: { widget_key: OTHER, enabled: "1" }, groupContext: true },
);
assert.deepEqual(group.settings[1], good);
console.log(
  "PASS: site key, challenge, disable, validation, consent, checkout, scoped settings and CSRF",
);
