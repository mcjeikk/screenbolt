/**
 * @file ScreenSnap — Custom Error Types
 * @description Typed error classes for structured error handling across the extension.
 * Provides error codes for programmatic handling and better debugging.
 * @version 0.5.1
 */

/**
 * Custom error class for extension-specific errors.
 * Includes error codes and optional detail objects for debugging.
 *
 * @example
 * throw new ExtensionError('Tab not found', ErrorCodes.TAB_NOT_FOUND, { tabId: 123 });
 */
export class ExtensionError extends Error {
  /**
   * @param {string} message - Human-readable error description
   * @param {string} code - Machine-readable error code from ErrorCodes
   * @param {Object} [details={}] - Additional context for debugging
   */
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'ExtensionError';
    this.code = code;
    this.details = details;
  }

  /**
   * Serialize error for message passing (Error objects don't survive structured clone).
   * @returns {{ name: string, message: string, code: string, details: Object }}
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
    };
  }
}

/**
 * @enum {string} Standardized error codes used across the extension.
 */
export const ErrorCodes = Object.freeze({
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
});

/**
 * Wrapper for Chrome API calls with consistent error handling.
 * @param {Function} apiFn - Chrome API function to call
 * @param {...*} args - Arguments to pass to the API function
 * @returns {Promise<*>} The API result
 * @throws {ExtensionError} If the API call fails
 */
export async function chromeApiCall(apiFn, ...args) {
  try {
    const result = await apiFn(...args);
    if (chrome.runtime.lastError) {
      throw new ExtensionError(
        chrome.runtime.lastError.message,
        ErrorCodes.CHROME_API_ERROR,
      );
    }
    return result;
  } catch (error) {
    if (error instanceof ExtensionError) throw error;
    throw new ExtensionError(
      error.message,
      ErrorCodes.UNEXPECTED_ERROR,
      { original: error.stack },
    );
  }
}

/**
 * Retry an async operation with exponential backoff.
 * @param {Function} fn - Async function to retry
 * @param {Object} [options] - Retry options
 * @param {number} [options.maxRetries=3] - Maximum retry attempts
 * @param {number} [options.delay=1000] - Initial delay in ms
 * @param {number} [options.backoff=2] - Backoff multiplier
 * @returns {Promise<*>} Result of the function
 * @throws {*} Last error if all retries fail
 */
export async function withRetry(fn, { maxRetries = 3, delay = 1000, backoff = 2 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, delay * Math.pow(backoff, attempt)));
      }
    }
  }
  throw lastError;
}
