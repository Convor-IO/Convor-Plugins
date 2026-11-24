const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createHmac } = require("node:crypto");
const { join } = require("node:path");
const { identity, visitorId, secret } = JSON.parse(
  execFileSync("php", [join(__dirname, "_ps-session-harness.php")], {
    encoding: "utf8",
  }),
);
const canonical = JSON.stringify({
  visitorId,
  id: identity.id,
  email: "",
  name: "",
  phone: "",
});
assert.equal(
  identity.userHash,
  createHmac("sha256", secret).update(canonical).digest("hex"),
);
assert.match(identity.id, /^ps_[a-f0-9]{64}$/);
console.log(
  "PASS: session separation, reset, encrypted shop/site secret and canonical PHP-to-Node HMAC",
);
