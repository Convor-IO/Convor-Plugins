#!/bin/sh
# OpenCart 4 + Convor module bootstrapper.
#
# Runs inside the php:8.2-apache container. Steps:
#   1. Install the PHP extensions OpenCart 4 requires.
#   2. Download + extract OpenCart 4.0.2.3 into the webroot.
#   3. Run OpenCart's CLI installer against MariaDB.
#   4. Register the Convor storefront event (mirrors install.php) and
#      persist the module settings (status/org_slug/api_base) via direct
#      DB inserts — the most reliable path, no admin UI needed.
#   5. Enable Apache mod_rewrite + start apache in the foreground.
set -eu

WEBROOT=/var/www/html
OC_VERSION="${OC_VERSION:-4.0.2.3}"
OC_URL="https://github.com/opencart/opencart/releases/download/${OC_VERSION}/opencart-${OC_VERSION}.zip"

echo "== [1/5] Installing PHP extensions required by OpenCart 4 =="
# gd/zip need dev headers; install them up front (idempotent).
if [ ! -f /usr/local/lib/php/extensions/no-debug-non-zts-20220829/gd.so ]; then
  apt-get update -qq
  apt-get install -y -qq --no-install-recommends \
    libpng-dev libjpeg-dev libfreetype6-dev libzip-dev libonig-dev \
    libcurl4-openssl-dev libxml2-dev \
    zip unzip git > /tmp/apt.log 2>&1
  docker-php-ext-configure gd --with-freetype --with-jpeg > /tmp/phpext.log 2>&1
  docker-php-ext-install -j"$(nproc)" mysqli gd zip curl > /tmp/phpext.log 2>&1
  echo "  php exts installed (mysqli, gd, zip, curl)"
fi
a2enmod rewrite > /dev/null 2>&1 || true

echo "== [2/5] Fetching OpenCart ${OC_VERSION} =="
if [ ! -f "${WEBROOT}/index.php" ]; then
  cd /tmp
  curl -fsSL -o oc.zip "${OC_URL}"
  unzip -q oc.zip -d oc
  # The release zip extracts to opencart-${OC_VERSION}/upload/.
  cp -a oc/opencart-${OC_VERSION}/upload/. "${WEBROOT}/"
  rm -rf oc oc.zip
fi

# OpenCart ships two placeholder config.php files (admin + catalog root)
# that must exist and be writable; the CLI installer fills them in.
touch "${WEBROOT}/config.php" "${WEBROOT}/admin/config.php"
chown -R www-data:www-data "${WEBROOT}"

echo "== [3/5] Running OpenCart CLI installer =="
# Wait for MariaDB to accept connections.
for i in $(seq 1 60); do
  if php -r "new mysqli('${DB_HOST}', '${DB_USER}', '${DB_PASS}', '${DB_NAME}');" 2>/dev/null; then
    break
  fi
  echo "  waiting for db... (${i})"
  sleep 2
done

cd "${WEBROOT}/install"
php cli_install.php install \
  --db_hostname "${DB_HOST}" \
  --db_username "${DB_USER}" \
  --db_password "${DB_PASS}" \
  --db_database "${DB_NAME}" \
  --db_prefix oc_ \
  --username admin \
  --password admin \
  --email admin@example.com \
  --http_server "http://localhost:8084/"
cd "${WEBROOT}"

# Remove the install/ dir as OpenCart recommends (prevents re-install).
rm -rf "${WEBROOT}/install"

echo "== [3.5] Copying Convor module source onto webroot =="
# Now that the OpenCart tree exists, layer our plugin files on top. The
# plugin's internal paths (admin/controller/module/..., catalog/...) mirror
# OpenCart's layout exactly.
cp -a /plugin/admin/. "${WEBROOT}/admin/"
cp -a /plugin/catalog/. "${WEBROOT}/catalog/"
chown -R www-data:www-data "${WEBROOT}"
echo "  convor module files in place"

echo "== [4/5] Registering Convor module (event + settings) =="
# Mirrors opencart/install.php (event registration) + the admin save()
# (settings persist). Doing it via direct SQL avoids any admin login/UI.
php <<'PHP'
<?php
$db = new mysqli(getenv('DB_HOST'), getenv('DB_USER'), getenv('DB_PASS'), getenv('DB_NAME'));
if ($db->connect_errno) { fwrite(fopen('php://stderr', 'w'), "DB connect failed: ".$db->connect_error."\n"); exit(1); }
$db->set_charset('utf8mb4');

// Tables are prefixed oc_ (we pass --db_prefix oc_ to the installer).
$eventTable = 'oc_event';
$settingTable = 'oc_setting';
// Verify they exist; if not, the installer failed and we should bail.
foreach ([$eventTable, $settingTable] as $chk) {
    $r = $db->query("SHOW TABLES LIKE '{$chk}'");
    if (!$r || $r->num_rows === 0) {
        fwrite(fopen('php://stderr', 'w'), "expected table {$chk} not found — installer may have failed\n");
        exit(1);
    }
}
echo "  event table   = {$eventTable}\n";
echo "  setting table = {$settingTable}\n";

// 1. Register the storefront header event (idempotent — mirrors install.php).
$db->query("DELETE FROM `{$eventTable}` WHERE code = 'convor_widget'");
$ins = $db->prepare("INSERT INTO `{$eventTable}` (`code`, `description`, `trigger`, `action`, `status`, `sort_order`) VALUES (?, ?, ?, ?, 1, 1)");
$code='convor_widget'; $desc='Convor widget header inject'; $trig='catalog/view/common/header/after'; $act='module/convor.injectScript';
$ins->bind_param('ssss', $code, $desc, $trig, $act);
$ins->execute();
echo "  registered event convor_widget (id={$ins->insert_id})\n";

// 2. Persist module settings into the setting table (mirrors admin save()).
$db->query("DELETE FROM `{$settingTable}` WHERE `code` = 'module_convor_widget'");

$store_id = 0;
$slug = getenv('CONVOR_ORG_SLUG') ?: 'test-org';
$base = getenv('CONVOR_API_BASE') ?: 'http://localhost:5173';

$rows = [
  ['module_convor_widget_status',   '1'],
  ['module_convor_widget_org_slug', $slug],
  ['module_convor_widget_api_base', $base],
];
foreach ($rows as $r) {
  $st = $db->prepare("INSERT INTO `{$settingTable}` (store_id, code, `key`, value, serialized) VALUES (?, 'module_convor_widget', ?, ?, 0)");
  $st->bind_param('iss', $store_id, $r[0], $r[1]);
  $st->execute();
}
echo "  inserted 3 module_convor_widget settings (status=1, slug={$slug}, api_base={$base})\n";
$db->close();
PHP

echo "== [5/5] Starting Apache =="
# Disable the OpenCart opcache reset requirement noise; ensure errors visible.
echo "opcache.enable=0" > /usr/local/etc/php/conf.d/opcache-disable.ini
exec apache2-foreground
