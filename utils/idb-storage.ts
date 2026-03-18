/**
 * ScreenBolt — IndexedDB Storage Module
 *
 * Promise-based wrapper around IndexedDB for storing recordings and thumbnails.
 * Replaces the base64 chunk relay through chrome.runtime.sendMessage.
 * Both offscreen documents and extension pages share the same IDB instance.
 *
 * @version 0.9.0
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DB_NAME = 'ScreenBoltDB';
const DB_VERSION = 1;

const STORE_RECORDINGS = 'recordings';
const STORE_THUMBNAILS = 'thumbnails';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecordingMetadata {
  duration: number;
  size: number;
  mimeType: string;
  timestamp: number;
}

export interface RecordingEntry {
  blob: Blob;
  metadata: RecordingMetadata;
}

// ---------------------------------------------------------------------------
// Cached connection
// ---------------------------------------------------------------------------

let dbInstance: IDBDatabase | null = null;

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

/** Open (or create) the ScreenBolt IndexedDB database. Reuses the cached connection if available. */
export function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_RECORDINGS)) {
        db.createObjectStore(STORE_RECORDINGS);
      }
      if (!db.objectStoreNames.contains(STORE_THUMBNAILS)) {
        db.createObjectStore(STORE_THUMBNAILS);
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
    };
  });
}

// ---------------------------------------------------------------------------
// Recordings
// ---------------------------------------------------------------------------

/** Save a recording blob with metadata. */
export async function saveRecording(
  id: string,
  blob: Blob,
  metadata: RecordingMetadata,
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDINGS, 'readwrite');
    const store = tx.objectStore(STORE_RECORDINGS);
    store.put({ blob, metadata } satisfies RecordingEntry, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(`Failed to save recording: ${tx.error?.message}`));
  });
}

/** Get a recording blob and metadata, or `null` if the id does not exist. */
export async function getRecording(id: string): Promise<RecordingEntry | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDINGS, 'readonly');
    const store = tx.objectStore(STORE_RECORDINGS);
    const request = store.get(id);
    request.onsuccess = () => resolve((request.result as RecordingEntry) || null);
    request.onerror = () => reject(new Error(`Failed to get recording: ${request.error?.message}`));
  });
}

/** Delete a recording by id. */
export async function deleteRecording(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDINGS, 'readwrite');
    const store = tx.objectStore(STORE_RECORDINGS);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(`Failed to delete recording: ${tx.error?.message}`));
  });
}

// ---------------------------------------------------------------------------
// Thumbnails
// ---------------------------------------------------------------------------

/** Save a thumbnail blob. */
export async function saveThumbnail(id: string, blob: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_THUMBNAILS, 'readwrite');
    const store = tx.objectStore(STORE_THUMBNAILS);
    store.put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(`Failed to save thumbnail: ${tx.error?.message}`));
  });
}

/** Get a thumbnail blob, or `null` if the id does not exist. */
export async function getThumbnail(id: string): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_THUMBNAILS, 'readonly');
    const store = tx.objectStore(STORE_THUMBNAILS);
    const request = store.get(id);
    request.onsuccess = () => resolve((request.result as Blob) || null);
    request.onerror = () => reject(new Error(`Failed to get thumbnail: ${request.error?.message}`));
  });
}

/** Delete a thumbnail by id. */
export async function deleteThumbnail(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_THUMBNAILS, 'readwrite');
    const store = tx.objectStore(STORE_THUMBNAILS);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(`Failed to delete thumbnail: ${tx.error?.message}`));
  });
}
