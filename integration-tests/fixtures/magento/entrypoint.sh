#!/bin/sh
# Magento 2.4 Open Source + Convor_Widget bootstrapper.
#
# Runs inside php:8.3-apache (Debian + mod_php). Mirrors the OpenCart
# fixture's approach: one entrypoint that does everything. Steps:
#   1. Install PHP exts Magento needs (pdo_mysql, gd, bcmath, intl, zip, ...).
#   2. If /var/www/html is empty: composer create-project magento/community-edition.
#   3. Wait for MariaDB.
#   4. Run setup:install (idempotent via env.php presence).
#   5. Enable Convor_Widget, setup:upgrade, write config, flush cache.
#   6. chown + start Apache.
#
# Why php:8.3-apache and not the official magento/magento-cloud image:
# the official image is huge (~3GB), needs a license key for some flows, and
# its entrypoint assumes a cloud env. php:8.3-apache + composer gives a clean,
# predictable, ~700MB base we fully control.
set -eu

WEBROOT=/var/www/html
MAGE="${WEBROOT}/bin/magento"
MAGENTO_VERSION="${MAGENTO_VERSION:-2.4.9}"

echo "== [1/6] Installing PHP extensions required by Magento 2.4 =="
if [ ! -f /usr/local/lib/php/extensions/no-debug-non-zts-20230831/gd.so ]; then
  apt-get update -qq
  # Magento requires: ext-pdo_mysql, gd, bcmath, intl, soap, zip, xsl, mbstring,
  # curl, sockets, sodium. Most ship with the image; we add the ones needing dev libs.
  apt-get install -y -qq --no-install-recommends \
    libpng-dev libjpeg-dev libfreetype6-dev libzip-dev libonig-dev \
    libicu-dev libxslt-dev libxml2-dev \
    zip unzip git > /tmp/apt.log 2>&1
  docker-php-ext-configure gd --with-freetype --with-jpeg > /tmp/phpext.log 2>&1
  docker-php-ext-install -j"$(nproc)" \
    pdo_mysql gd bcmath intl soap xsl zip sockets ftp > /tmp/phpext.log 2>&1
  echo "  php exts installed"
fi
# Install Composer (php:8.3-apache ships WITHOUT it). Idempotent.
if ! command -v composer >/dev/null 2>&1; then
  echo "  installing composer..."
  curl -fsSL https://getcomposer.org/installer -o /tmp/composer-setup.php
  php /tmp/composer-setup.php --install-dir=/usr/local/bin --filename=composer > /tmp/composer-install.log 2>&1
  rm -f /tmp/composer-setup.php
fi
# Raise memory_limit (Magento setup is RAM-hungry).
echo "memory_limit=2G" > /usr/local/etc/php/conf.d/memory-limit.ini

echo "== [2/6] Ensuring Magento source (composer create-project) =="
if [ ! -x "$MAGE" ]; then
  cd "$WEBROOT"
  # Create the project WITHOUT running install scripts (faster, avoids auth).
  # magento/community-edition is the public metapackage — no marketplace key.
  # --ignore-platform-reqs: composer's platform check can lag the exts we just
  # built (cache); the real check happens at runtime, which Magento's own
  # setup:install does thoroughly.
  composer create-project --no-install --no-scripts --ignore-platform-reqs \
    "magento/community-edition:${MAGENTO_VERSION}" /tmp/mg-new > /tmp/composer-create.log 2>&1 || {
      echo "  composer create-project failed; see /tmp/composer-create.log" >&2
      cat /tmp/composer-create.log >&2
      exit 1
    }
  # Move the created project into the webroot.
  shopt -s dotglob 2>/dev/null || true
  cp -a /tmp/mg-new/. "$WEBROOT"/ 2>/dev/null || cp -a /tmp/mg-new/* "$WEBROOT"/
  rm -rf /tmp/mg-new
  cd "$WEBROOT"
  # Now install dependencies (this is the slow part: ~214 packages).
  composer install --no-interaction --optimize-autoloader --ignore-platform-reqs > /tmp/composer-install.log 2>&1 || {
      echo "  composer install failed; see /tmp/composer-install.log" >&2
      tail -30 /tmp/composer-install.log >&2
      exit 1
  }
  echo "  magento ${MAGENTO_VERSION} source ready"
else
  echo "  magento source already present (reusing)"
fi

# chown the webroot so www-data owns it. The Convor module dir is a read-only
# bind-mount, so tolerate EPERM there (|| true) rather than aborting.
chown -R www-data:www-data "$WEBROOT" 2>/dev/null || true

echo "== [3/6] Waiting for MariaDB =="
for i in $(seq 1 60); do
  if php -r "new PDO('mysql:host=${CONVOR_DB_HOST};dbname=${CONVOR_DB_NAME}', '${CONVOR_DB_USER}', '${CONVOR_DB_PASS}');" 2>/dev/null; then
    break
  fi
  echo "  waiting for db... (${i})"
  sleep 2
done

echo "== [4/6] Running magento setup:install (if not yet installed) =="
cd "$WEBROOT"
# The DB lives on tmpfs (lost on `docker compose down`), so any env.php left
# in the webroot volume is stale — the install it points at no longer exists.
# Drop it so setup:install always runs against a fresh DB on each cold boot.
rm -f "${WEBROOT}/app/etc/env.php"
if [ ! -f "${WEBROOT}/app/etc/env.php" ]; then
  runuser -u www-data -- php "$MAGE" setup:install \
    --base-url="http://localhost:8085/" \
    --db-host="$CONVOR_DB_HOST" \
    --db-name="$CONVOR_DB_NAME" \
    --db-user="$CONVOR_DB_USER" \
    --db-password="$CONVOR_DB_PASS" \
    --opensearch-host="opensearch" \
    --opensearch-port="9200" \
    --admin-firstname="Convor" \
    --admin-lastname="Admin" \
    --admin-email="admin@example.com" \
    --admin-user="admin" \
    --admin-password="admin12345" \
    --language="en_US" \
    --currency="USD" \
    --timezone="UTC" \
    --use-rewrites="1" \
    --cleanup-database 2>&1 | tail -25
  echo "  setup:install complete"
else
  echo "  already installed (app/etc/env.php present)"
fi

echo "== [5/6] Enabling Convor_Widget + writing config =="
runuser -u www-data -- php "$MAGE" module:enable Convor_Widget
runuser -u www-data -- php "$MAGE" setup:upgrade
# config:set validates the path against the merged system.xml structure,
# which is only loaded into the config cache after a cache flush. Clean the
# cache first so the Convor_Widget section is visible to config:set.
runuser -u www-data -- php "$MAGE" cache:clean config full_page 2>/dev/null || true

# Try config:set for each value; if the path validation still rejects it
# (race with cache warmup), fall back to a direct core_config_data insert.
write_config() {
  path="$1"; val="$2"
  if ! runuser -u www-data -- php "$MAGE" config:set "$path" "$val" 2>/dev/null; then
    echo "  config:set $path failed; inserting directly into core_config_data"
    php -r "
      \$pdo = new PDO('mysql:host='.getenv('CONVOR_DB_HOST').';dbname='.getenv('CONVOR_DB_NAME'), getenv('CONVOR_DB_USER'), getenv('CONVOR_DB_PASS'));
      \$pdo->exec('DELETE FROM core_config_data WHERE path = '.\$pdo->quote('$path'));
      \$stmt = \$pdo->prepare('INSERT INTO core_config_data (scope, scope_id, path, value) VALUES (\"default\", 0, ?, ?)');
      \$stmt->execute(['$path', '$val']);
    "
  fi
}
write_config convor_widget/general/enabled 1
write_config convor_widget/general/org_slug test-org
write_config convor_widget/general/api_base http://localhost:5173
runuser -u www-data -- php "$MAGE" cache:flush
echo "  module enabled + config written (org_slug=test-org, api_base=http://localhost:5173)"

echo "== [6/6] Starting Apache =="
a2enmod rewrite > /dev/null 2>&1 || true
exec apache2-foreground
