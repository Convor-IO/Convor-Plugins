#!/usr/bin/env bash
# Non-mutating, real public HTTPS checks; never logs credentials or response bodies.
set -euo pipefail
base=https://ps-qa-1807.topsoft4u.com
for entry in '/ 200' '/admin-dev/ 401' '/install/ 404' '/api/ 404' '/.env 404' '/config/settings.inc.php 404'; do
    read -r path expected <<< "$entry"
    actual=$(curl -sS --proto '=https' --max-time 20 -o /dev/null -w '%{http_code}' "$base$path")
    [[ "$actual" == "$expected" ]] || { echo "FAIL $path: $actual (expected $expected)"; exit 1; }
    echo "PASS $path: $actual"
done
headers=$(curl -fsSI --proto '=https' --max-time 20 "$base/")
grep -iq '^x-robots-tag:.*noindex' <<< "$headers"
grep -iq '^cache-control:.*no-store' <<< "$headers"
echo 'PASS public TLS, noindex/no-store, protected BO and blocked private paths'
