/**
 * @file ScreenBolt — Custom Error Types
 * Typed error classes for structured error handling across the extension.
 * Provides error codes for programmatic handling and better debugging.
 * @version 0.5.1
 */

/** Standardized error codes used across the extension. */
export const ErrorCodes = {
  CAPTURE_FAILED: 'CAPTURE_FAILED',
  RECORDING_FAILED: 'RECORDING_FAILED',
  STORAGE_FULL: 'STORAGE_FULL',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  TAB_NOT_FOUND: 'TAB_NOT_FOUND',
  OFFSCREEN_FAILED: 'OFFSCREEN_FAILED',
  SW_TERMINATED: 'SW_TERMINATED',
  CONTEXT_INVALIDATED: 'CONTEXT_INVALIDATED',
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  RESTRICTED_URL: 'RESTRICTED_URL',
  OOM_RISK: 'OOM_RISK',
  CHROME_API_ERROR: 'CHROME_API_ERROR',
  UNEXPECTED_ERROR: 'UNEXPECTED_ERROR',
} as const satisfies Record<string, string>;

// Runtime freeze for test compatibility and true immutability
Object.freeze(ErrorCodes);

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Custom error class for extension-specific errors.
 * Includes error codes and optional detail objects for debugging.
 *
 * @example
 * throw new ExtensionError('Tab not found', ErrorCodes.TAB_NOT_FOUND, { tabId: 123 });
 */
export class ExtensionError extends Error {
  override readonly name = 'ExtensionError';
  readonly code: ErrorCode;
  readonly details: Record<string, unknown>;

  constructor(message: string, code: ErrorCode, details: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }

  /** Serialize error for message passing (Error objects don't survive structured clone). */
  toJSON(): { name: string; message: string; code: ErrorCode; details: Record<string, unknown> } {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
    };
  }
}

/**
 * Wrapper for Chrome API calls with consistent error handling.
 * @throws {ExtensionError} If the API call fails
 */
export async function chromeApiCall<T>(
  apiFn: (...args: unknown[]) => Promise<T>,
  ...args: unknown[]
): Promise<T> {
  try {
    const result = await apiFn(...args);
    if (chrome.runtime.lastError) {
      throw new ExtensionError(
        chrome.runtime.lastError.message ?? 'Unknown Chrome API error',
        ErrorCodes.CHROME_API_ERROR,
      );
    }
    return result;
  } catch (error) {
    if (error instanceof ExtensionError) throw error;
    throw new ExtensionError((error as Error).message, ErrorCodes.UNEXPECTED_ERROR, {
      original: (error as Error).stack,
    });
  }
}

export interface RetryOptions {
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in ms (default: 1000) */
  delay?: number;
  /** Backoff multiplier (default: 2) */
  backoff?: number;
}

/** Retry an async operation with exponential backoff. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { maxRetries = 3, delay = 1000, backoff = 2 }: RetryOptions = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, delay * Math.pow(backoff, attempt)));
      }
    }
  }
  throw lastError;
}
