import {Pool} from "pg";

/** Persisted OAuth install data, keyed by store hash. */
export interface StoreInstall {
  /** BC store hash, e.g. "abc123". */
  storeHash: string;
  /** Long-lived store API access token from the OAuth exchange. */
  accessToken: string;
  /** ISO-8601 timestamp of the install. */
  installedAt: string;
  /** Owner scope the token was minted with, if BC returned one. */
  scope?: string;
}

export interface TokenStore {
  get(storeHash: string): Promise<StoreInstall | undefined>;
  upsert(install: StoreInstall): Promise<void>;
  delete(storeHash: string): Promise<void>;
  close(): Promise<void>;
}

interface PostgresTokenStoreOptions {
  connectionString: string;
}

interface TokenRow {
  store_hash: string;
  access_token: string;
  scope: string | null;
  created_at: Date;
}

export class PostgresTokenStore implements TokenStore {
  private readonly pool: Pool;
  private ready: Promise<void> | undefined;

  constructor(opts: PostgresTokenStoreOptions) {
    this.pool = new Pool({connectionString: opts.connectionString});
  }

  private ensureSchema(): Promise<void> {
    this.ready ??= this.pool
      .query(`
      CREATE TABLE IF NOT EXISTS bigcommerce_tokens (
        store_hash text PRIMARY KEY,
        access_token text NOT NULL,
        scope text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
      .then(() => undefined);
    return this.ready;
  }

  async get(storeHash: string): Promise<StoreInstall | undefined> {
    await this.ensureSchema();
    const result = await this.pool.query<TokenRow>(
      `
        SELECT store_hash, access_token, scope, created_at
        FROM bigcommerce_tokens
        WHERE store_hash = $1
      `,
      [storeHash]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      storeHash: row.store_hash,
      accessToken: row.access_token,
      installedAt: row.created_at.toISOString(),
      scope: row.scope ?? undefined,
    };
  }

  async upsert(install: StoreInstall): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `
        INSERT INTO bigcommerce_tokens (
          store_hash,
          access_token,
          scope,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, now())
        ON CONFLICT (store_hash)
        DO UPDATE SET
          access_token = EXCLUDED.access_token,
          scope = EXCLUDED.scope,
          updated_at = now()
      `,
      [
        install.storeHash,
        install.accessToken,
        install.scope ?? null,
        install.installedAt,
      ]
    );
  }

  async delete(storeHash: string): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      "DELETE FROM bigcommerce_tokens WHERE store_hash = $1",
      [storeHash]
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
