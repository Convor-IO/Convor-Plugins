import {Pool} from "pg";
import type {ConvorWidgetConfig} from "./widget-config.js";

export interface SettingsStore {
  get(storeHash: string): Promise<ConvorWidgetConfig | undefined>;
  upsert(storeHash: string, config: ConvorWidgetConfig): Promise<void>;
  delete(storeHash: string): Promise<void>;
  close(): Promise<void>;
}

interface PostgresSettingsStoreOptions {
  connectionString: string;
}

interface SettingsRow {
  slug: string;
  api_base: string;
}

export class PostgresSettingsStore implements SettingsStore {
  private readonly pool: Pool;
  private ready: Promise<void> | undefined;

  constructor(opts: PostgresSettingsStoreOptions) {
    this.pool = new Pool({connectionString: opts.connectionString});
  }

  private ensureSchema(): Promise<void> {
    this.ready ??= this.pool
      .query(`
      CREATE TABLE IF NOT EXISTS bigcommerce_settings (
        store_hash text PRIMARY KEY,
        slug text NOT NULL,
        api_base text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
      .then(() => undefined);
    return this.ready;
  }

  async get(storeHash: string): Promise<ConvorWidgetConfig | undefined> {
    await this.ensureSchema();
    const result = await this.pool.query<SettingsRow>(
      `
        SELECT slug, api_base
        FROM bigcommerce_settings
        WHERE store_hash = $1
      `,
      [storeHash]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      slug: row.slug,
      apiBase: row.api_base,
    };
  }

  async upsert(storeHash: string, config: ConvorWidgetConfig): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `
        INSERT INTO bigcommerce_settings (
          store_hash,
          slug,
          api_base,
          updated_at
        )
        VALUES ($1, $2, $3, now())
        ON CONFLICT (store_hash)
        DO UPDATE SET
          slug = EXCLUDED.slug,
          api_base = EXCLUDED.api_base,
          updated_at = now()
      `,
      [storeHash, config.slug, config.apiBase]
    );
  }

  async delete(storeHash: string): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      "DELETE FROM bigcommerce_settings WHERE store_hash = $1",
      [storeHash]
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
