import { Pool } from "pg";
import { config } from "./config.js";

/**
 * Postgres-backed persistence for the OAuth token + per-store Convor settings.
 *
 * Ecwid access tokens do not expire, so a durable row keyed by storeId is
 * enough for marketplace installs and survives app restarts/deployments.
 */

export interface InstallRecord {
  storeId: string;
  accessToken: string;
  scope: string;
  installedAt: string;
}

export interface ConvorSettings {
  slug: string;
  apiBase: string;
  updatedAt: string;
}

export interface StoreRecord {
  install: InstallRecord;
  settings?: ConvorSettings;
}

interface StoreRow {
  store_id: string;
  access_token: string;
  scope: string;
  installed_at: Date;
  slug: string | null;
  api_base: string | null;
  settings_updated_at: Date | null;
}

const pool = new Pool({ connectionString: config.databaseUrl });

let ready: Promise<void> | undefined;

function ensureSchema(): Promise<void> {
  ready ??= pool
    .query(`
  CREATE TABLE IF NOT EXISTS ecwid_stores (
    store_id text PRIMARY KEY,
    access_token text NOT NULL,
    scope text NOT NULL,
    installed_at timestamptz NOT NULL DEFAULT now(),
    slug text,
    api_base text,
    settings_updated_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
  )
`)
    .then(() => undefined);
  return ready;
}

function toRecord(row: StoreRow): StoreRecord {
  const record: StoreRecord = {
    install: {
      storeId: row.store_id,
      accessToken: row.access_token,
      scope: row.scope,
      installedAt: row.installed_at.toISOString(),
    },
  };
  if (row.slug && row.api_base && row.settings_updated_at) {
    record.settings = {
      slug: row.slug,
      apiBase: row.api_base,
      updatedAt: row.settings_updated_at.toISOString(),
    };
  }
  return record;
}

/** Read a store's full record, or `null` if it isn't installed. */
export async function readStore(storeId: string): Promise<StoreRecord | null> {
  await ensureSchema();
  const result = await pool.query<StoreRow>(
    `
      SELECT
        store_id,
        access_token,
        scope,
        installed_at,
        slug,
        api_base,
        settings_updated_at
      FROM ecwid_stores
      WHERE store_id = $1
    `,
    [storeId],
  );
  const row = result.rows[0];
  return row ? toRecord(row) : null;
}

/** Save or replace the OAuth install record for a store. */
export async function saveInstall(record: InstallRecord): Promise<void> {
  await ensureSchema();
  await pool.query(
    `
      INSERT INTO ecwid_stores (
        store_id,
        access_token,
        scope,
        installed_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (store_id)
      DO UPDATE SET
        access_token = EXCLUDED.access_token,
        scope = EXCLUDED.scope,
        updated_at = now()
    `,
    [record.storeId, record.accessToken, record.scope, record.installedAt],
  );
}

/** Save the Convor settings (slug + apiBase) for a store. */
export async function saveSettings(
  storeId: string,
  settings: ConvorSettings,
): Promise<void> {
  await ensureSchema();
  const result = await pool.query(
    `
      UPDATE ecwid_stores
      SET
        slug = $2,
        api_base = $3,
        settings_updated_at = $4,
        updated_at = now()
      WHERE store_id = $1
    `,
    [storeId, settings.slug, settings.apiBase, settings.updatedAt],
  );
  if (result.rowCount === 0) {
    throw new Error(
      `Cannot save settings for store ${storeId}: app not installed.`,
    );
  }
}

/** Remove all local data for a store (called on uninstall). */
export async function deleteStore(storeId: string): Promise<boolean> {
  await ensureSchema();
  const result = await pool.query(
    "DELETE FROM ecwid_stores WHERE store_id = $1",
    [storeId],
  );
  return (result.rowCount ?? 0) > 0;
}

/** Iterate every installed store — used for diagnostics/debug endpoints. */
export async function listStores(): Promise<string[]> {
  await ensureSchema();
  const result = await pool.query<{ store_id: string }>(
    "SELECT store_id FROM ecwid_stores ORDER BY store_id",
  );
  return result.rows.map((row) => row.store_id);
}
