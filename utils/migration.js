/**
 * @file ScreenBolt — Data Migration Utility
 * @description Handles data schema migrations between extension versions.
 * Called from the service worker's onInstalled handler during updates.
 * @version 0.5.1
 */

import { STORAGE_KEYS, DEFAULT_SETTINGS } from './constants.js';
import { createLogger } from './logger.js';

const log = createLogger('Migration');

/**
 * Migration registry: maps version thresholds to migration functions.
 * Each migration runs once when updating FROM a version older than the threshold.
 * @type {Array<{ version: string, migrate: Function }>}
 */
const MIGRATIONS = [
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

/**
 * Run all applicable migrations for the given version transition.
 * Compares previous version to each migration threshold and runs
 * any migration where previousVersion < migration.version.
 *
 * @param {string} previousVersion - The version the user is updating from
 * @param {string} currentVersion - The version the user is updating to
 * @returns {Promise<void>}
 */
export async function runMigrations(previousVersion, currentVersion) {
  log.info(`Running migrations: ${previousVersion} → ${currentVersion}`);

  for (const { version, migrate } of MIGRATIONS) {
    if (compareVersions(previousVersion, version) < 0) {
      try {
        log.info(`Applying migration for v${version}`);
        await migrate();
        log.info(`Migration v${version} completed`);
      } catch (err) {
        log.error(`Migration v${version} failed:`, err.message);
        // Continue with other migrations — don't block on one failure
      }
    }
  }

  // Record the last successful migration version
  await chrome.storage.local.set({ lastMigrationVersion: currentVersion });
}

/**
 * Compare two semver version strings.
 * @param {string} a - First version (e.g., "0.4.1")
 * @param {string} b - Second version (e.g., "0.5.0")
 * @returns {number} -1 if a < b, 0 if a == b, 1 if a > b
 */
function compareVersions(a, b) {
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

/**
 * Migration to v0.4.0: Ensure settings have all new keys from v0.4.0.
 * Adds theme, notifications, history, and maxHistory defaults if missing.
 */
async function migrateToV040() {
  const result = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
  const settings = result[STORAGE_KEYS.SETTINGS] || {};

  const updated = { ...DEFAULT_SETTINGS, ...settings };
  await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: updated });
}

/**
 * Migration to v0.5.0: Clean up stale session state.
 * Removes any orphaned recording state from previous sessions.
 */
async function migrateToV050() {
  try {
    await chrome.storage.session.remove('recordingState');
  } catch {
    // session storage may not persist across updates — safe to ignore
  }
}

/**
 * Migration to v0.5.1: Ensure settings schema is complete.
 * Backfills any missing settings keys with defaults.
 */
async function migrateToV051() {
  const result = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
  const settings = result[STORAGE_KEYS.SETTINGS] || {};
  const updated = { ...DEFAULT_SETTINGS, ...settings };
  await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: updated });
}
