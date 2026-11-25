// Local-only synthetic identities for the real WordPress/SaaS smoke test.
// Never run against production. No real account or customer credentials.

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const api = process.env.CONVOR_API_URL ?? "http://localhost:17203";
const dashboard = process.env.CONVOR_DASHBOARD_URL ?? "http://localhost:17204";
const wp = process.env.WP_URL ?? "http://127.0.0.1:18206";
for (const url of [api, dashboard, wp]) {
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
    throw new Error("Local QA only");
}
const wpContainer = process.env.WP_QA_CONTAINER ?? "convor-wordpress-1806-wp-1";
const dbContainer =
  process.env.CONVOR_QA_DB_CONTAINER ??
  "convor-feat-wordpress-finalization-1806-dev-postgres-1";
if (
  !/^convor-wordpress-[0-9]+-wp-1$/.test(wpContainer) ||
  !/^convor-[a-z0-9-]+-dev-postgres-1$/.test(dbContainer)
)
  throw new Error("Not an isolated QA container");
const editorial = process.env.CONVOR_DOCS_FIXTURE === "1";
const suffix = randomBytes(5).toString("hex");
const wpUser = `wpqa_${suffix}`;
const wpPassword = randomBytes(24).toString("base64url");
const email = `wordpress-${suffix}@e2e.test`;
const password = `Qa1!${randomBytes(24).toString("base64url")}`;
execFileSync(
  "docker",
  [
    "exec",
    "-e",
    "WP_QA_USER",
    "-e",
    "WP_QA_PASS",
    "-e",
    "WP_QA_DISPLAY",
    wpContainer,
    "php",
    "-r",
    'require "/var/www/html/wp-load.php"; $id=wp_insert_user(array("user_login"=>getenv("WP_QA_USER"),"user_pass"=>getenv("WP_QA_PASS"),"user_email"=>getenv("WP_QA_USER")."@example.test","display_name"=>getenv("WP_QA_DISPLAY"),"role"=>"administrator")); if(is_wp_error($id)){fwrite(STDERR,$id->get_error_message());exit(1);}',
  ],
  {
    env: {
      ...process.env,
      WP_QA_USER: wpUser,
      WP_QA_PASS: wpPassword,
      WP_QA_DISPLAY: editorial ? "Anna Kowalska" : wpUser,
    },
    stdio: ["ignore", "ignore", "inherit"],
  },
);
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
    name: editorial ? "Anna Kowalska" : "WordPress QA",
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
    name: editorial ? "Convor" : "Convor WordPress QA",
    slug: `wordpress-qa-${suffix}`,
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
if (editorial) {
  const headers = {
    ...auth,
    "X-Organization-Id": org.id,
    "X-Project-Id": project.id,
  };
  const renamed = await request(`/api/projects/${project.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ name: "Convor" }),
  });
  if (!renamed.ok) throw new Error(`Rename fixture website: ${renamed.status}`);
  const domain = await request(`/api/projects/${project.id}/domains`, {
    method: "POST",
    headers,
    body: JSON.stringify({ value: new URL(wp).hostname, isPrimary: true }),
  });
  if (domain.status !== 201)
    throw new Error(`Fixture primary domain: ${domain.status}`);
}
mkdirSync("dist", { recursive: true });
const variables = {
  WP_URL: wp,
  CONVOR_API_URL: api,
  CONVOR_DASHBOARD_URL: dashboard,
  WP_ADMIN_USER: wpUser,
  WP_ADMIN_PASSWORD: wpPassword,
  CONVOR_TEST_EMAIL: email,
  CONVOR_TEST_PASSWORD: password,
  CONVOR_ORG_ID: org.id,
  CONVOR_PROJECT_ID: project.id,
};
writeFileSync(
  editorial ? "dist/wordpress-docs.env" : "dist/wordpress-qa.env",
  Object.entries(variables)
    .map(([key, value]) => `export ${key}='${value}'\n`)
    .join(""),
  { mode: 0o600 },
);
console.log(
  editorial
    ? "Provisioned isolated editorial fixture; credentials are in ignored dist/wordpress-docs.env."
    : "Provisioned isolated synthetic WordPress and Convor accounts; credentials are in ignored dist/wordpress-qa.env.",
);
