// Disposable QA only: inspect the real read-only Webservice capability boundary.
// Do not enable Webservice or create credentials in any merchant's live store.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

const base = new URL(process.env.PRESTASHOP_URL ?? "http://localhost:18217");
if (
  !["localhost", "127.0.0.1"].includes(base.hostname) ||
  !["18217", "18218"].includes(base.port) ||
  base.protocol !== "http:"
)
  throw new Error("Owned local QA fixture only");
const project =
  base.port === "18218"
    ? "convor-prestashop-1807-82"
    : "convor-prestashop-1807";
const container = `${project}-prestashop-1`;
assert.equal(
  execFileSync(
    "docker",
    [
      "inspect",
      "-f",
      '{{ index .Config.Labels "com.docker.compose.project" }}',
      container,
    ],
    { encoding: "utf8" },
  ).trim(),
  project,
);
const php = (code, env = {}) =>
  execFileSync(
    "docker",
    [
      "exec",
      ...Object.keys(env).flatMap((name) => ["-e", name]),
      container,
      "php",
      "-r",
      code,
    ],
    { encoding: "utf8", env: { ...process.env, ...env } },
  );
const key = randomBytes(16).toString("hex");
const fixture = php(
  `
require "/var/www/html/config/config.inc.php";
Context::getContext()->employee = new Employee(1);
$old = Configuration::getGlobalValue("PS_WEBSERVICE");
$account = new WebserviceKey();
$account->key = getenv("CONVOR_QA_WEBSERVICE_KEY");
$account->description = "Disposable Convor read-only compatibility probe";
$account->active = true;
if (!$account->add()) { exit(1); }
try {
    $account->associateTo(array(1));
    $permissions = array();
    foreach (array("products","combinations","stock_availables","languages","currencies") as $resource) {
        $permissions[$resource] = array("GET"=>true);
    }
    if (!WebserviceKey::setPermissionForAccount($account->id,$permissions)
        || !Configuration::updateGlobalValue("PS_WEBSERVICE",1)) throw new Exception("Failed to configure fixture");
    echo json_encode(array("id"=>(int)$account->id,"old"=>(int)$old));
} catch (Throwable $e) {
    $account->delete();
    Configuration::updateGlobalValue("PS_WEBSERVICE",(int)$old);
    exit(1);
}
`,
  { CONVOR_QA_WEBSERVICE_KEY: key },
);
const { id, old } = JSON.parse(fixture);
const request = (path, method = "GET") =>
  fetch(new URL(path, base), {
    method,
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Basic ${Buffer.from(key + ":").toString("base64")}`,
      Accept: "application/json",
    },
  });
try {
  for (const resource of [
    "products",
    "combinations",
    "stock_availables",
    "languages",
    "currencies",
  ]) {
    const response = await request(
      `/api/${resource}?output_format=JSON&display=full&limit=0,2`,
    );
    assert.equal(response.status, 200, resource);
    const data = await response.json();
    // Record field names only; no credentials, customer or order data.
    const rows = Array.isArray(data[resource]) ? data[resource] : [];
    console.log(
      resource +
        ": " +
        rows.length +
        " rows; fields: " +
        Object.keys(rows[0] ?? {}).join(", "),
    );
  }
  // Verify the actual JSON shape and scope of a bounded read, without relying
  // on "display=full" or downloading unrelated/private resources.
  const readPage = async (resource, display, offset) => {
    const url = new URL(`/api/${resource}`, base);
    for (const [name, value] of Object.entries({
      output_format: "JSON",
      display: `[${display}]`,
      id_shop: "1",
      language: "1",
      sort: "[id_ASC]",
      limit: `${offset},2`,
    }))
      url.searchParams.set(name, value);
    const response = await request(url.pathname + url.search);
    assert.equal(response.status, 200, resource);
    const body = await response.json();
    assert.ok(Array.isArray(body[resource]), resource);
    return body[resource];
  };
  const productFields =
    "id,name,link_rewrite,description_short,reference,ean13,active,available_for_order,visibility,show_price,date_upd,id_default_combination";
  const firstPage = await readPage("products", productFields, 0);
  const secondPage = await readPage("products", productFields, 2);
  assert.equal(firstPage.length, 2);
  assert.equal(secondPage.length, 2);
  assert.ok(
    Number(firstPage.at(-1).id) < Number(secondPage[0].id),
    "stable ascending pagination",
  );
  assert.ok(
    firstPage.every((row) =>
      Object.keys(row).every((k) => productFields.split(",").includes(k)),
    ),
    "no extra fields",
  );
  const variants = await readPage(
    "combinations",
    "id,id_product,reference,ean13,default_on",
    0,
  );
  assert.equal(variants.length, 2);
  // PS may serialize an empty collection differently from a populated page.
  const emptyUrl = new URL("/api/combinations", base);
  for (const [k, v] of Object.entries({
    output_format: "JSON",
    display: "[id,id_product,reference,ean13,default_on]",
    id_shop: "1",
    language: "1",
    sort: "[id_ASC]",
    limit: "0,2",
    "filter[id_product]": "999999999",
  }))
    emptyUrl.searchParams.set(k, v);
  const empty = await request(emptyUrl.pathname + emptyUrl.search);
  assert.equal(empty.status, 200);
  const emptyBody = await empty.json();
  console.log(
    "Variant JSON shapes",
    JSON.stringify(
      variants.map((v) => ({
        id: typeof v.id,
        parent: typeof v.id_product,
        default_on: v.default_on,
        reference: typeof v.reference,
        ean13: typeof v.ean13,
      })),
    ),
    "empty shape",
    JSON.stringify(emptyBody),
  );
  console.log(
    "PASS: shop/language-scoped field allowlist and ordered pagination; JSON field shapes",
    JSON.stringify(
      Object.fromEntries(
        Object.entries(firstPage[0]).map(([k, v]) => [
          k,
          Array.isArray(v) ? "array" : typeof v,
        ]),
      ),
    ),
  );
  if (process.env.CONVOR_RUN_CATALOG_ADAPTER === "1") {
    const saas = resolve(
      import.meta.dirname,
      "../../../../../../saas/.worktrees/feat-prestashop-finalization-1807",
    );
    execFileSync(
      "pnpm",
      [
        "--filter",
        "@convor/server",
        "exec",
        "tsx",
        "scripts/probe-prestashop-catalog.ts",
      ],
      {
        cwd: saas,
        env: {
          ...process.env,
          NODE_ENV: "test",
          SSRF_TEST_ALLOW_HOSTS: "localhost",
          PRESTASHOP_URL: base.origin,
          CONVOR_QA_WEBSERVICE_KEY: key,
        },
        stdio: ["ignore", "inherit", "inherit"],
      },
    );
  }
  const orders = await request("/api/orders?output_format=JSON&limit=0,1");
  assert.ok(
    [401, 403, 405].includes(orders.status),
    "Catalog key must not read orders",
  );
  console.log(
    "PASS: real PrestaShop catalog reads; orders denied with HTTP " +
      orders.status,
  );
} finally {
  php(
    `
require "/var/www/html/config/config.inc.php";
Context::getContext()->employee = new Employee(1);
$account = new WebserviceKey((int)getenv("CONVOR_QA_WEBSERVICE_ID"));
if ($account->id) $account->delete();
Configuration::updateGlobalValue("PS_WEBSERVICE",(int)getenv("CONVOR_QA_WEBSERVICE_OLD"));
`,
    {
      CONVOR_QA_WEBSERVICE_ID: String(id),
      CONVOR_QA_WEBSERVICE_OLD: String(old),
    },
  );
}
