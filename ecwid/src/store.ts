import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { config } from "./config.js";

/**
 * File-backed persistence for the OAuth token + per-store Convor settings.
 *
 * Ecwid access tokens do not expire, so a simple one-file-per-store store is
 * sufficient for a self-hosted app. Each store's data lives at
 * `<dataDir>/<storeId>.json`.
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

function filePath(storeId: string): string {
  return join(config.dataDir, `${storeId}.json`);
}

function ensureDataDir(): void {
  if (!existsSync(config.dataDir)) {
    mkdirSync(config.dataDir, { recursive: true });
  }
}

/** Read a store's full record, or `null` if it isn't installed. */
export function readStore(storeId: string): StoreRecord | null {
  const path = filePath(storeId);
  if (!existsSync(path)) {
    return null;
  }
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as StoreRecord;
}

/** Persist a store's full record. */
function writeStore(storeId: string, record: StoreRecord): void {
  ensureDataDir();
  const path = filePath(storeId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(record, null, 2), "utf8");
}

/** Save or replace the OAuth install record for a store. */
export function saveInstall(record: InstallRecord): void {
  const existing = readStore(record.storeId);
  const next: StoreRecord = { install: record };
  if (existing?.settings) {
    next.settings = existing.settings;
  }
  writeStore(record.storeId, next);
}

/** Save the Convor settings (slug + apiBase) for a store. */
export function saveSettings(storeId: string, settings: ConvorSettings): void {
  const existing = readStore(storeId);
  if (!existing) {
    throw new Error(
      `Cannot save settings for store ${storeId}: app not installed.`,
    );
  }
  writeStore(storeId, { install: existing.install, settings });
}
/** Remove all local data for a store (called on uninstall). */
export function deleteStore(storeId: string): boolean {
  const path = filePath(storeId);
  if (!existsSync(path)) {
    return false;
  }
  try {
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

/** Iterate every installed store — used for diagnostics/debug endpoints. */
export function listStores(): string[] {
  if (!existsSync(config.dataDir)) {
    return [];
  }
  return readdirSync(config.dataDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""));
}
