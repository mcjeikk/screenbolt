/**
 * @file ScreenBolt — Shared Helper Functions
 * @description Utility functions used across multiple extension components.
 * Includes timestamp formatting, file size display, sanitization, and debouncing.
 * @version 0.5.0
 */

/**
 * Generate a formatted timestamp string for filenames.
 *
 * @example
 * getTimestamp(); // "2026-03-16_14-30-05"
 */
export function getTimestamp(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

/** Format a byte count into a human-readable file size. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Format a duration in seconds to MM:SS display. */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Generate a unique identifier using crypto.randomUUID. */
export function generateId(): string {
  return crypto.randomUUID();
}

/** Sanitize a filename by removing unsafe characters. */
export function sanitizeFilename(name: string): string {
  if (!name || typeof name !== 'string') return 'untitled';
  return (
    name
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '') // eslint-disable-line no-control-regex
      .replace(/\s+/g, '_')
      .trim()
      .slice(0, 200) || 'untitled'
  );
}

/**
 * Sanitize user-provided text to prevent XSS when used in the DOM.
 * Strips HTML tags and trims whitespace.
 */
export function sanitizeText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.textContent!.trim();
}

/** Create a debounced version of a function. */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delayMs: number,
): (...args: Parameters<T>) => void {
  let timerId: ReturnType<typeof setTimeout> | null = null;
  return function (this: unknown, ...args: Parameters<T>): void {
    clearTimeout(timerId!);
    timerId = setTimeout(() => fn.apply(this, args), delayMs);
  };
}

/** Create a throttled version of a function. */
export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  limitMs: number,
): (...args: Parameters<T>) => void {
  let lastRun = 0;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  return function (this: unknown, ...args: Parameters<T>): void {
    const now = Date.now();
    const remaining = limitMs - (now - lastRun);
    clearTimeout(timerId!);
    if (remaining <= 0) {
      lastRun = now;
      fn.apply(this, args);
    } else {
      timerId = setTimeout(() => {
        lastRun = Date.now();
        fn.apply(this, args);
      }, remaining);
    }
  };
}

/** Promise-based delay utility. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Estimate the byte size of a base64 data URL. */
export function estimateDataUrlSize(dataUrl: string): number {
  if (!dataUrl || typeof dataUrl !== 'string') return 0;
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1) return 0;
  const base64Length = dataUrl.length - commaIndex - 1;
  return Math.round((base64Length * 3) / 4);
}

/** Convert a base64 string to a Uint8Array. */
export function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/** Check if a tab URL is capturable (not a chrome:// or extension page). */
export function isCapturableUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  return (
    !url.startsWith('chrome://') &&
    !url.startsWith('chrome-extension://') &&
    !url.startsWith('about:') &&
    !url.startsWith('edge://')
  );
}

/** Create a safe DOM element with text content (avoids innerHTML). */
export function createElement(
  tag: string,
  attrs: Record<string, string | Record<string, string>> = {},
  textContent: string = '',
): HTMLElement {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'className') {
      el.className = value as string;
    } else if (key === 'dataset') {
      for (const [dk, dv] of Object.entries(value as Record<string, string>)) {
        el.dataset[dk] = dv;
      }
    } else if (key.startsWith('aria')) {
      el.setAttribute(`aria-${key.slice(4).toLowerCase()}`, value as string);
    } else {
      el.setAttribute(key, value as string);
    }
  }
  if (textContent) {
    el.textContent = textContent;
  }
  return el;
}
