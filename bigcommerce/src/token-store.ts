import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Persisted OAuth install data, keyed by store hash.
 *
 * PRODUCTION NOTE: this sample writes one JSON object per line to a local
 * file (`data/tokens.json` by default). That is fine for a single-instance
 * dev deployment but is **not safe for production**: there is no locking,
 * no rotation, and a second instance will not see writes from the first.
 * Swap in Postgres / Redis / KV before listing on the marketplace.
 */
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
}

interface FileStoreOptions {
  path: string;
}

export class FileTokenStore implements TokenStore {
  private readonly path: string;
  private readonly cache = new Map<string, StoreInstall>();
  private loaded = false;

  constructor(opts: FileStoreOptions) {
    this.path = opts.path;
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await readFile(this.path, "utf8");
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const entry = JSON.parse(trimmed) as StoreInstall;
          if (entry && typeof entry.storeHash === "string") {
            this.cache.set(entry.storeHash, entry);
          }
        } catch {
          // Skip a corrupt line rather than failing the whole store.
        }
      }
    } catch (err) {
      // Missing file on first boot is expected — treat as empty.
      if (!isNotFound(err)) throw err;
    }
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const body = [...this.cache.values()]
      .map((entry) => JSON.stringify(entry))
      .join("\n");
    await writeFile(this.path, `${body}\n`, "utf8");
  }

  async get(storeHash: string): Promise<StoreInstall | undefined> {
    await this.load();
    return this.cache.get(storeHash);
  }

  async upsert(install: StoreInstall): Promise<void> {
    await this.load();
    this.cache.set(install.storeHash, install);
    await this.persist();
  }

  async delete(storeHash: string): Promise<void> {
    await this.load();
    this.cache.delete(storeHash);
    await this.persist();
  }
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}
