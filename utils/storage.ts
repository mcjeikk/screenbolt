/**
 * @file ScreenBolt — Storage Utility
 * Wrapper around chrome.storage with error handling, defaults, and typed accessors.
 * Centralizes all storage operations for the extension.
 */

import { STORAGE_KEYS, DEFAULT_SETTINGS } from './constants.js';
import { createLogger } from './logger.js';
import type { Settings, HistoryEntry } from './types.js';

const log = createLogger('Storage');

/** Load extension settings from chrome.storage.sync, merged with defaults. */
export async function getSettings(): Promise<Settings> {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
    return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] || {}) };
  } catch (err) {
    log.error('Failed to load settings:', err);
    return { ...DEFAULT_SETTINGS };
  }
}

/** Save extension settings to chrome.storage.sync. */
export async function saveSettings(settings: Settings): Promise<boolean> {
  try {
    await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: settings });
    return true;
  } catch (err) {
    log.error('Failed to save settings:', err);
    return false;
  }
}

/** Load history entries from chrome.storage.local. */
export async function getHistory(): Promise<HistoryEntry[]> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.HISTORY_ENTRIES);
    return (result[STORAGE_KEYS.HISTORY_ENTRIES] as HistoryEntry[] | undefined) ?? [];
  } catch (err) {
    log.error('Failed to load history:', err);
    return [];
  }
}

/** Save history entries to chrome.storage.local. Prunes on quota overflow. */
export async function saveHistory(entries: HistoryEntry[]): Promise<boolean> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY_ENTRIES]: entries });
    return true;
  } catch (err) {
    log.error('Failed to save history:', err);
    if (err instanceof Error && err.message.includes('QUOTA_BYTES')) {
      log.warn('Storage quota exceeded — pruning oldest entries');
      const pruned = entries.slice(0, Math.floor(entries.length / 2));
      try {
        await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY_ENTRIES]: pruned });
        return true;
      } catch (retryErr) {
        log.error('Failed to save even after pruning:', retryErr);
      }
    }
    return false;
  }
}

/** Add a single entry to the history, respecting max limit. */
export async function addToHistory(
  entry: HistoryEntry,
  maxItems: number = 100,
): Promise<boolean> {
  const entries = await getHistory();
  entries.unshift(entry);

  while (entries.length > maxItems) {
    entries.pop();
  }

  return saveHistory(entries);
}

/** Remove a single entry from history by ID. Returns the updated list. */
export async function removeFromHistory(id: string): Promise<HistoryEntry[]> {
  const entries = await getHistory();
  const filtered = entries.filter((e) => e.id !== id);
  await saveHistory(filtered);
  return filtered;
}

/** Clear all history entries. */
export async function clearHistory(): Promise<boolean> {
  return saveHistory([]);
}

/** Get a value from chrome.storage.local. */
export async function getLocal<T>(key: string, defaultValue: T | null = null): Promise<T | null> {
  try {
    const result = await chrome.storage.local.get(key);
    return (result[key] as T) ?? defaultValue;
  } catch (err) {
    log.error(`Failed to get local key "${key}":`, err);
    return defaultValue;
  }
}

/** Set a value in chrome.storage.local. */
export async function setLocal<T>(key: string, value: T): Promise<boolean> {
  try {
    await chrome.storage.local.set({ [key]: value });
    return true;
  } catch (err) {
    log.error(`Failed to set local key "${key}":`, err);
    return false;
  }
}

/** Set multiple values in chrome.storage.local at once. */
export async function setLocalBatch(items: Record<string, unknown>): Promise<boolean> {
  try {
    await chrome.storage.local.set(items);
    return true;
  } catch (err) {
    log.error('Failed to batch set local storage:', err);
    return false;
  }
}

/** Get multiple values from chrome.storage.local. */
export async function getLocalBatch(keys: string[]): Promise<Record<string, unknown>> {
  try {
    return await chrome.storage.local.get(keys);
  } catch (err) {
    log.error('Failed to batch get local storage:', err);
    return {};
  }
}

/** Remove keys from chrome.storage.local. */
export async function removeLocal(keys: string | string[]): Promise<boolean> {
  try {
    await chrome.storage.local.remove(keys);
    return true;
  } catch (err) {
    log.error('Failed to remove local keys:', err);
    return false;
  }
}
