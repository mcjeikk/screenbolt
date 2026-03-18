/**
 * @file ScreenBolt — Logger Utility
 * Provides a structured logging system with levels and module prefixes.
 * Debug mode can be activated via storage setting.
 */

import { EXTENSION_NAME } from './constants.js';
import type { ErrorLogEntry } from './types.js';

/** Log level numeric values for comparison */
const LOG_LEVELS = Object.freeze({
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
} as const);

type LogLevel = (typeof LOG_LEVELS)[keyof typeof LOG_LEVELS];

// ── Error Buffer ─────────────────────────────────
const ERROR_BUFFER_MAX_SIZE = 50;
const ERROR_BUFFER_FLUSH_DEBOUNCE_MS = 5000;
const ERROR_LOG_STORAGE_KEY = 'errorLog';

let errorBuffer: ErrorLogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Format the first two args into a single message string.
 * Covers the common pattern: log.error('Save failed', error)
 */
function formatBufferMessage(args: unknown[]): string {
  let msg = args.length > 0 ? String(args[0]) : '';
  if (args.length > 1) {
    const second = args[1];
    if (second instanceof Error) {
      const detail = `${second.message}${second.stack ? '\n' + second.stack : ''}`;
      msg += ' | ' + detail.slice(0, 200);
    } else {
      msg += ' | ' + String(second).slice(0, 200);
    }
  }
  return msg;
}

/** Flush the error buffer to chrome.storage.local. */
function flushBuffer(): void {
  flushTimer = null;
  try {
    chrome.storage.local.set({ [ERROR_LOG_STORAGE_KEY]: [...errorBuffer] });
  } catch {
    /* best effort — storage may not be available in all contexts */
  }
}

/** Schedule a debounced flush (for WARN level). */
function scheduleDebouncedFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(flushBuffer, ERROR_BUFFER_FLUSH_DEBOUNCE_MS);
}

// Hydrate buffer from storage on module load (async, best-effort)
try {
  chrome.storage.local.get(ERROR_LOG_STORAGE_KEY).then((result) => {
    const stored = result[ERROR_LOG_STORAGE_KEY];
    if (Array.isArray(stored) && stored.length > 0) {
      // Merge: stored entries first, then any captured during hydration
      errorBuffer = [...(stored as ErrorLogEntry[]), ...errorBuffer].slice(
        -ERROR_BUFFER_MAX_SIZE,
      );
    }
  });
} catch {
  /* storage not available (e.g. in test environment) */
}

/** Logger class with module-scoped prefixes and configurable level. */
class Logger {
  #module: string;
  #level: LogLevel;

  constructor(module: string, level: LogLevel = LOG_LEVELS.INFO) {
    this.#module = module;
    this.#level = level;
  }

  /** Set the minimum log level. */
  setLevel(level: LogLevel): void {
    this.#level = level;
  }

  /** Enable debug mode (show all log levels). */
  enableDebug(): void {
    this.#level = LOG_LEVELS.DEBUG;
  }

  /** Internal logging method. */
  #log(level: LogLevel, levelName: string, ...args: unknown[]): void {
    if (level < this.#level) return;

    // Capture WARN and ERROR to ring buffer
    if (level >= LOG_LEVELS.WARN) {
      const entry: ErrorLogEntry = {
        timestamp: new Date().toISOString(),
        module: this.#module,
        level: levelName,
        message: formatBufferMessage(args),
      };
      errorBuffer.push(entry);
      if (errorBuffer.length > ERROR_BUFFER_MAX_SIZE) {
        errorBuffer = errorBuffer.slice(-ERROR_BUFFER_MAX_SIZE);
      }
      // ERROR: flush immediately. WARN: debounced.
      if (level >= LOG_LEVELS.ERROR) {
        flushBuffer();
      } else {
        scheduleDebouncedFlush();
      }
    }

    const timestamp = new Date().toISOString().slice(11, 23);
    const prefix = `[${timestamp}][${EXTENSION_NAME}][${this.#module}][${levelName}]`;

    switch (level) {
      case LOG_LEVELS.ERROR:
        console.error(prefix, ...args);
        break;
      case LOG_LEVELS.WARN:
        console.warn(prefix, ...args);
        break;
      case LOG_LEVELS.INFO:
        console.info(prefix, ...args);
        break;
      default:
        console.debug(prefix, ...args);
    }
  }

  /** Log a debug-level message. */
  debug(...args: unknown[]): void {
    this.#log(LOG_LEVELS.DEBUG, 'DEBUG', ...args);
  }

  /** Log an info-level message. */
  info(...args: unknown[]): void {
    this.#log(LOG_LEVELS.INFO, 'INFO', ...args);
  }

  /** Log a warning-level message. */
  warn(...args: unknown[]): void {
    this.#log(LOG_LEVELS.WARN, 'WARN', ...args);
  }

  /** Log an error-level message. */
  error(...args: unknown[]): void {
    this.#log(LOG_LEVELS.ERROR, 'ERROR', ...args);
  }
}

/**
 * Factory function to create a logger for a specific module.
 *
 * @example
 * import { createLogger } from '../utils/logger.js';
 * const log = createLogger('Editor');
 * log.info('Editor initialized');
 * log.error('Save failed', error);
 */
export function createLogger(module: string): Logger {
  return new Logger(module);
}

/** Get a copy of the current error log buffer. */
export function getErrorLog(): ErrorLogEntry[] {
  return [...errorBuffer];
}

/** Clear the error log buffer and remove from storage. */
export async function clearErrorLog(): Promise<void> {
  errorBuffer = [];
  try {
    await chrome.storage.local.remove(ERROR_LOG_STORAGE_KEY);
  } catch {
    /* best effort */
  }
}

export { LOG_LEVELS };
