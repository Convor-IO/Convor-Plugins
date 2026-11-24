// Exercise actual grants, Redis expiry and project origin policy without
// altering the merchant fixture's existing configuration.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";

const api = "http://localhost:17243";
const dashboard = "http://localhost:17244";
assert.equal(process.env.CONVOR_API_URL, api);
assert.equal(process.env.CONVOR_DASHBOARD_URL, dashboard);
const redis = "convor-feat-prestashop-finalization-1807-dev-redis-1";
assert.equal(
  execFileSync(
    "docker",
    [
      "inspect",
      "-f",
      '{{ index .Config.Labels "com.docker.compose.project" }}',
      redis,
    ],
    { encoding: "utf8" },
  ).trim(),
  "convor-feat-prestashop-finalization-1807-dev",
);
const required = (name) => {
  const value = process.env[name];
  if (!value) throw Error("Missing " + name);
  return value;
};
async function request(path, method = "GET", body, headers = {}) {
  return fetch(api + path, {
    method,
    redirect: "manual",
    headers: {
      Origin: dashboard,
      "Content-Type": "application/json",
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const login = await request("/api/auth/sign-in/email", "POST", {
  email: required("CONVOR_TEST_EMAIL"),
  password: required("CONVOR_TEST_PASSWORD"),
});
assert.equal(login.status, 200);
const cookie = login.headers
  .getSetCookie()
  .map((v) => v.split(";")[0])
  .join("; ");
const created = await request(
  "/api/organizations",
  "POST",
  {
    name: "PrestaShop pairing policy QA",
    slug: "ps-policy-" + randomBytes(8).toString("hex"),
  },
  { cookie },
);
assert.equal(created.status, 201);
const org = (await created.json()).id;
const list = await request("/api/projects", "GET", undefined, {
  cookie,
  "X-Organization-Id": org,
});
assert.equal(list.status, 200);
const project = (await list.json()).projects[0].id;
const scope = { cookie, "X-Organization-Id": org, "X-Project-Id": project };
const detail = await request(
  "/api/projects/" + project,
  "GET",
  undefined,
  scope,
);
assert.equal(detail.status, 200);
const publicKey = (await detail.json()).project.widgetPublicKey;
assert.match(publicKey, /^convor_wpk_[a-f0-9]{64}$/);
const siteUrl = "https://ps-fixture.example.test/store/";
const callback =
  siteUrl + "index.php?fc=module&module=convor&controller=pairing";
const make = () => {
  const verifier = randomBytes(32).toString("hex");
  const state = randomBytes(32).toString("hex");
  return {
    verifier,
    input: {
      siteUrl,
      callback,
      state,
      verifierHash: createHash("sha256").update(verifier).digest("hex"),
    },
  };
};
const grantKeys = new Set();
async function start(input, headers = scope) {
  return request("/api/prestashop/pairing/start", "POST", input, headers);
}
async function grant() {
  const { verifier, input } = make();
  const response = await start(input);
  assert.equal(response.status, 200);
  const url = new URL((await response.json()).redirectUrl);
  assert.equal(url.origin, new URL(siteUrl).origin);
  assert.equal(url.searchParams.get("state"), input.state);
  assert.ok(!url.searchParams.has("widgetKey"));
  const code = url.searchParams.get("code");
  assert.match(code, /^[A-Za-z0-9_-]{32}$/);
  grantKeys.add("convor:oauth-state:prestashop-widget-pairing:" + code);
  return { code, state: input.state, verifier, callback };
}
function redisCommand(...args) {
  return execFileSync(
    "docker",
    ["exec", redis, "redis-cli", "--raw", ...args],
    { encoding: "utf8" },
  ).trim();
}
async function redeem(body, provider = "prestashop") {
  return request("/api/" + provider + "/pairing/redeem", "POST", body, {
    Origin: new URL(siteUrl).origin,
  });
}
try {
  const { input } = make();
  for (const denied of [
    {
      ...input,
      callback:
        "https://other.example.test/store/index.php?fc=module&module=convor&controller=pairing",
    },
    { ...input, callback: callback + "&next=bad" },
    { ...input, callback: callback.replace("/store/", "/") },
  ])
    assert.equal((await start(denied)).status, 400);
  const wrongScope = await start(input, {
    ...scope,
    "X-Organization-Id": required("CONVOR_ORG_ID"),
  });
  assert.ok(
    [400, 403, 404].includes(wrongScope.status),
    "cross-tenant scope rejected",
  );
  assert.ok(
    [401, 403].includes((await start(input, {})).status),
    "anonymous start rejected",
  );
  const one = await grant();
  for (const bad of [
    { ...one, state: "a".repeat(64) },
    { ...one, verifier: "a".repeat(64) },
    { ...one, callback: callback + "&extra=1" },
  ])
    assert.equal((await redeem(bad)).status, 400);
  assert.equal((await redeem(one, "wordpress")).status, 400);
  const race = await Promise.all([redeem(one), redeem(one)]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 400]);
  const winner = race.find((r) => r.status === 200);
  assert.equal((await winner.json()).widgetKey, publicKey);
  assert.equal((await redeem(one)).status, 400);
  const expiring = await grant();
  const redisKey =
    "convor:oauth-state:prestashop-widget-pairing:" + expiring.code;
  const ttl = Number(redisCommand("PTTL", redisKey));
  assert.ok(ttl > 0 && ttl <= 300000, "real Redis TTL is at most five minutes");
  assert.equal(redisCommand("PEXPIRE", redisKey, "1"), "1");
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(
    (await redeem(expiring)).status,
    400,
    "expired grant cannot redeem",
  );
  // Force state transitions on the new disposable organization only.
  // These fixture mutations test redemption against live authorization state,
  // not a claim that a public key rotation UI exists.
  const db = "convor-feat-prestashop-finalization-1807-dev-postgres-1";
  assert.notEqual(org, required("CONVOR_ORG_ID"));
  assert.equal(
    execFileSync(
      "docker",
      [
        "inspect",
        "-f",
        '{{ index .Config.Labels "com.docker.compose.project" }}',
        db,
      ],
      { encoding: "utf8" },
    ).trim(),
    "convor-feat-prestashop-finalization-1807-dev",
  );
  function change(sql, vars = {}) {
    const output = execFileSync(
      "docker",
      [
        "exec",
        "-i",
        db,
        "psql",
        "-U",
        "convor",
        "-d",
        "convor_dev",
        "-qAt",
        "-v",
        "ON_ERROR_STOP=1",
        "-v",
        `org=${org}`,
        "-v",
        `project=${project}`,
        "-v",
        `qa_email=${required("CONVOR_TEST_EMAIL")}`,
        ...Object.entries(vars).flatMap(([name, value]) => [
          "-v",
          `${name}=${value}`,
        ]),
      ],
      { input: sql + "\n", encoding: "utf8" },
    ).trim();
    assert.equal(output, "1", "Exactly one disposable fixture row must change");
  }
  const membershipSql = (from, to) =>
    `WITH changed AS (UPDATE memberships SET status='${to}' WHERE org_id=:'org' AND user_id=(SELECT id::text FROM users WHERE email=:'qa_email') AND is_owner=true AND status='${from}' RETURNING id) SELECT count(*) FROM changed;`;
  const permissionRevoked = await grant();
  change(membershipSql("active", "suspended"));
  try {
    assert.equal(
      (await redeem(permissionRevoked)).status,
      403,
      "revoked membership cannot redeem",
    );
  } finally {
    change(membershipSql("suspended", "active"));
  }
  const keyRotated = await grant();
  const replacement = `convor_wpk_${randomBytes(32).toString("hex")}`;
  const keySql =
    "WITH changed AS (UPDATE projects SET widget_public_key=:'next_key' WHERE id=:'project' AND org_id=:'org' AND widget_public_key=:'old_key' RETURNING id) SELECT count(*) FROM changed;";
  change(keySql, { old_key: publicKey, next_key: replacement });
  try {
    assert.equal(
      (await redeem(keyRotated)).status,
      400,
      "rotated key invalidates grant",
    );
  } finally {
    change(keySql, { old_key: replacement, next_key: publicKey });
  }
  const revoked = await grant();
  const domain = await request(
    "/api/projects/" + project + "/domains",
    "POST",
    { value: "unrelated.example.test", isPrimary: true },
    scope,
  );
  assert.ok(
    domain.ok,
    "configure a distinct allowed domain in the disposable project",
  );
  const updated = await request(
    "/api/projects/" + project,
    "PATCH",
    { domainPolicy: "allowlist" },
    scope,
  );
  assert.equal(updated.status, 200);
  assert.equal(
    (await redeem(revoked)).status,
    403,
    "origin policy rechecked at redemption",
  );
  assert.equal(
    (await start(input)).status,
    403,
    "disallowed origin rejected at start",
  );
  console.log(
    "PASS: real API callback/path, cross-tenant, anonymous, proof/state, cross-platform, atomic race/replay, actual Redis TTL, membership/key changes and origin revocation",
  );
} finally {
  for (const key of grantKeys) redisCommand("DEL", key);
}
