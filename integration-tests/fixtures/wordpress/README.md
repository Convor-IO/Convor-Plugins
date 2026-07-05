# WordPress integration-test fixture

A real WordPress 6.x install in Docker, with the Convor plugin bind-mounted
from the repo, used by `integration-tests/e2e/wordpress.spec.ts`.

## Bring it up

```bash
cd integration-tests/fixtures/wordpress
docker compose up -d        # boots MariaDB + WordPress on :8080

# Wait for the install screen to be ready (usually <10s):
until curl -sf -o /dev/null http://localhost:8080/wp-admin/install.php; do
  sleep 1
done

# Run the famous 5-minute install:
curl -s -o /dev/null -X POST 'http://localhost:8080/wp-admin/install.php?step=2' \
  -d 'weblog_title=Convor Test' \
  -d 'user_name=admin' -d 'admin_password=admin' -d 'admin_password2=admin' \
  -d 'pw_weak=1' -d 'admin_email=admin@example.com' -d 'blog_public=0' -d 'language='

# Activate the Convor plugin + configure slug/apiBase:
./activate.sh
```

## Tear it down

```bash
docker compose down -v   # -v purges the DB volume so the next run is clean
```

## How the plugin gets installed

The `wp` service bind-mounts `plugins/wordpress/` (the repo source) read-only
into the container at `/var/www/html/wp-content/plugins/convor/`. WordPress
sees it as an installed plugin; `activate.sh` flips it on via the
`active_plugins` option.

## Why `api_base=http://localhost:5173`

The Playwright browser runs on the host, so it sees `localhost:5173` for the
widget dev/preview server. The WP container doesn't need to reach the widget
URL itself — the plugin only emits the snippet, the browser does the fetching.

(If you wanted the WP container to reach the widget too — e.g. for a
server-side `wp_remote_get` smoke test — use `host.docker.internal:5173`,
which resolves to the host from inside Docker but not from the host browser.
The Playwright test uses `localhost:5173` for that reason.)
