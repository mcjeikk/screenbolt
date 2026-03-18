import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Unit tests for idb-storage.js API surface.
 * Since IndexedDB is a browser API not available in Node, we test the module
 * structure and exports. Full integration testing requires a browser environment.
 */

// Mock indexedDB for Node environment — intentionally partial mocks
const mockStore = new Map<string, unknown>();
const mockObjectStore = {
  put: vi.fn((value: unknown, key: string) => {
    mockStore.set(key, value);
    return { onsuccess: null as (() => void) | null, onerror: null as (() => void) | null };
  }),
  get: vi.fn((key: string) => {
    const req = { result: mockStore.get(key) || null, onsuccess: null as (() => void) | null, onerror: null as (() => void) | null };
    setTimeout(() => req.onsuccess?.(), 0);
    return req;
  }),
  delete: vi.fn((key: string) => {
    mockStore.delete(key);
    return { onsuccess: null as (() => void) | null, onerror: null as (() => void) | null };
  }),
};

const mockTransaction = {
  objectStore: vi.fn(() => mockObjectStore),
  oncomplete: null as (() => void) | null,
  onerror: null as (() => void) | null,
};

const mockDB = {
  transaction: vi.fn(() => mockTransaction),
  objectStoreNames: { contains: vi.fn(() => true) },
  createObjectStore: vi.fn(),
};

// Patch global indexedDB before importing module
globalThis.indexedDB = {
  open: vi.fn(() => {
    const req = { onupgradeneeded: null, onsuccess: null as ((ev: unknown) => void) | null, onerror: null, result: mockDB };
    setTimeout(() => {
      req.onsuccess?.({ target: { result: mockDB } });
    }, 0);
    return req;
  }),
} as unknown as IDBFactory;

// Now import after mocking
const { openDB, saveRecording, getRecording, deleteRecording, saveThumbnail, getThumbnail, deleteThumbnail } =
  await import('../../utils/idb-storage.js');

beforeEach(() => {
  mockStore.clear();
  vi.clearAllMocks();
});

describe('idb-storage module exports', () => {
  it('exports all expected functions', () => {
    expect(typeof openDB).toBe('function');
    expect(typeof saveRecording).toBe('function');
    expect(typeof getRecording).toBe('function');
    expect(typeof deleteRecording).toBe('function');
    expect(typeof saveThumbnail).toBe('function');
    expect(typeof getThumbnail).toBe('function');
    expect(typeof deleteThumbnail).toBe('function');
  });
});

describe('openDB', () => {
  it('returns a database instance', async () => {
    const db = await openDB();
    expect(db).toBe(mockDB);
  });

  it('returns the same instance on subsequent calls (cached)', async () => {
    const db1 = await openDB();
    const db2 = await openDB();
    expect(db1).toBe(db2);
  });
});
