/**
 * ScreenBolt — Data Migration Utility
 *
 * Handles data schema migrations between extension versions.
 * Called from the service worker's onInstalled handler during updates.
 */

import { STORAGE_KEYS, DEFAULT_SETTINGS } from './constants.js';
import { createLogger } from './logger.js';

import type { Settings } from './types.js';

const log = createLogger('Migration');

// ── Types ───────────────────────────────────────────

/** A single migration definition: runs when updating FROM a version older than `version`. */
interface MigrationDef {
  version: string;
  migrate: () => Promise<void>;
}

// ── Migration Registry ──────────────────────────────

/** Ordered list of migrations. Each runs once per threshold crossing. */
const MIGRATIONS: readonly MigrationDef[] = [
  {
    version: '0.4.0',
    migrate: migrateToV040,
  },
  {
    version: '0.5.0',
    migrate: migrateToV050,
  },
  {
    version: '0.5.1',
    migrate: migrateToV051,
  },
];

// ── Public API ──────────────────────────────────────

/**
 * Run all applicable migrations for the given version transition.
 * Compares previous version to each migration threshold and runs
 * any migration where previousVersion < migration.version.
 */
export async function runMigrations(
  previousVersion: string,
  currentVersion: string,
): Promise<void> {
  log.info(`Running migrations: ${previousVersion} → ${currentVersion}`);

  for (const { version, migrate } of MIGRATIONS) {
    if (compareVersions(previousVersion, version) < 0) {
      try {
        log.info(`Applying migration for v${version}`);
        await migrate();
        log.info(`Migration v${version} completed`);
      } catch (err) {
        log.error(`Migration v${version} failed:`, (err as Error).message);
        // Continue with other migrations — don't block on one failure
      }
    }
  }

  // Record the last successful migration version
  await chrome.storage.local.set({ lastMigrationVersion: currentVersion });
}

/**
 * Compare two semver version strings.
 * Returns -1 if a < b, 0 if a == b, 1 if a > b.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  const len = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < len; i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }
  return 0;
}

// ── Individual Migrations ───────────────────────────

/** v0.4.0 — Ensure settings have all new keys (theme, notifications, history, maxHistory). */
async function migrateToV040(): Promise<void> {
  const result = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
  const settings = (result[STORAGE_KEYS.SETTINGS] ?? {}) as Partial<Settings>;

  const updated: Settings = { ...DEFAULT_SETTINGS, ...settings };
  await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: updated });
}

/** v0.5.0 — Clean up stale session state from previous sessions. */
async function migrateToV050(): Promise<void> {
  try {
    await chrome.storage.session.remove('recordingState');
  } catch {
    // session storage may not persist across updates — safe to ignore
  }
}

/** v0.5.1 — Backfill any missing settings keys with defaults. */
async function migrateToV051(): Promise<void> {
  const result = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
  const settings = (result[STORAGE_KEYS.SETTINGS] ?? {}) as Partial<Settings>;
  const updated: Settings = { ...DEFAULT_SETTINGS, ...settings };
  await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: updated });
}
