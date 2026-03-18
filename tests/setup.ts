/**
 * Vitest global setup — mocks for Chrome Extension APIs and browser globals.
 */
import { vi } from 'vitest';

// Minimal chrome.* API mock — intentionally partial (only what tests need)
globalThis.chrome = {
  runtime: {
    sendMessage: vi.fn(),
    lastError: undefined,
    onMessage: { addListener: vi.fn() },
  },
  storage: {
    sync: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    session: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    onChanged: { addListener: vi.fn() },
  },
  tabs: {
    sendMessage: vi.fn(),
    query: vi.fn(),
  },
} as unknown as typeof chrome;

// Mock atob/btoa for base64 tests
if (typeof globalThis.atob === 'undefined') {
  globalThis.atob = (str: string) => Buffer.from(str, 'base64').toString('binary');
  globalThis.btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
}
