// Local-only synthetic identities for the real PrestaShop/SaaS smoke test.
// Never run against production. No real account or customer credentials.

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const api = process.env.CONVOR_API_URL ?? "http://localhost:17243";
const dashboard = process.env.CONVOR_DASHBOARD_URL ?? "http://localhost:17244";
const shop = process.env.PRESTASHOP_URL ?? "http://localhost:18217";
for (const url of [api, dashboard, shop]) {
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
    throw new Error("Local QA only");
}
const dbContainer = "convor-feat-prestashop-finalization-1807-dev-postgres-1";
const marketingDemo = process.argv.includes("--marketing-demo");
const suffix = randomBytes(5).toString("hex");
const email = `prestashop-${suffix}@e2e.test`;
const password = `Qa1!${randomBytes(24).toString("base64url")}`;
const request = async (path, options = {}) =>
  fetch(api + path, {
    ...options,
    headers: {
      Origin: dashboard,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
const signup = await request("/api/auth/sign-up/email", {
  method: "POST",
  body: JSON.stringify({
    email,
    password,
    name: marketingDemo ? "TopSoft4U Support" : "PrestaShop QA",
  }),
});
if (signup.status !== 200)
  throw new Error(`Synthetic signup failed: ${signup.status}`);
// Provisioning only: the local fixture has mail delivery disabled. This is
// the isolated synthetic user's verification flag, not an auth bypass in app code.
execFileSync(
  "docker",
  [
    "exec",
    "-i",
    dbContainer,
    "psql",
    "-U",
    "convor",
    "-d",
    "convor_dev",
    "-v",
    "ON_ERROR_STOP=1",
    "-v",
    `qa_email=${email}`,
  ],
  {
    input: "UPDATE users SET email_verified=true WHERE email=:'qa_email';\n",
    stdio: ["pipe", "ignore", "inherit"],
  },
);
const login = await request("/api/auth/sign-in/email", {
  method: "POST",
  body: JSON.stringify({ email, password }),
});
if (login.status !== 200)
  throw new Error(`Synthetic login failed: ${login.status}`);
const cookie = login.headers
  .getSetCookie()
  .map((value) => value.split(";")[0])
  .join("; ");
const auth = { cookie };
const created = await request("/api/organizations", {
  method: "POST",
  headers: auth,
  body: JSON.stringify({
    name: marketingDemo ? "TopSoft4U" : "Convor PrestaShop QA",
    slug: `prestashop-qa-${suffix}`,
  }),
});
if (created.status !== 201)
  throw new Error(`Synthetic organization failed: ${created.status}`);
const org = await created.json();
const response = await request("/api/projects", {
  headers: { ...auth, "X-Organization-Id": org.id },
});
if (!response.ok) throw new Error(`Projects: ${response.status}`);
const { projects } = await response.json();
const project = projects.find((item) => item.isDefault) ?? projects[0];
if (!project) throw new Error("No default QA website");
mkdirSync("dist", { recursive: true });
const variables = {
  PRESTASHOP_URL: shop,
  CONVOR_API_URL: api,
  CONVOR_DASHBOARD_URL: dashboard,
  CONVOR_TEST_EMAIL: email,
  CONVOR_TEST_PASSWORD: password,
  CONVOR_ORG_ID: org.id,
  CONVOR_PROJECT_ID: project.id,
};
writeFileSync(
  "dist/prestashop-qa.env",
  Object.entries(variables)
    .map(([key, value]) => `export ${key}='${value}'\n`)
    .join(""),
  { mode: 0o600 },
);
console.log(
  "Provisioned isolated synthetic PrestaShop and Convor accounts; credentials are in ignored dist/prestashop-qa.env.",
);
