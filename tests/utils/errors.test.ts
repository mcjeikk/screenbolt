import { describe, it, expect, vi } from 'vitest';
import { ExtensionError, ErrorCodes, withRetry } from '../../utils/errors.js';

describe('ExtensionError', () => {
  it('creates an error with message, code, and details', () => {
    const error = new ExtensionError('Tab not found', ErrorCodes.TAB_NOT_FOUND, { tabId: 123 });

    expect(error.message).toBe('Tab not found');
    expect(error.code).toBe('TAB_NOT_FOUND');
    expect(error.details).toEqual({ tabId: 123 });
    expect(error.name).toBe('ExtensionError');
    expect(error).toBeInstanceOf(Error);
  });

  it('defaults details to empty object', () => {
    const error = new ExtensionError('test', ErrorCodes.CAPTURE_FAILED);
    expect(error.details).toEqual({});
  });

  it('serializes to JSON for message passing', () => {
    const error = new ExtensionError('Storage full', ErrorCodes.STORAGE_FULL, { used: '10MB' });
    const json = error.toJSON();

    expect(json).toEqual({
      name: 'ExtensionError',
      message: 'Storage full',
      code: 'STORAGE_FULL',
      details: { used: '10MB' },
    });
  });
});

describe('ErrorCodes', () => {
  it('is frozen (immutable)', () => {
    expect(Object.isFrozen(ErrorCodes)).toBe(true);
  });

  it('contains all expected codes', () => {
    const expectedCodes = [
      'CAPTURE_FAILED',
      'RECORDING_FAILED',
      'STORAGE_FULL',
      'PERMISSION_DENIED',
      'TAB_NOT_FOUND',
      'OFFSCREEN_FAILED',
      'SW_TERMINATED',
      'CONTEXT_INVALIDATED',
      'INVALID_MESSAGE',
      'RESTRICTED_URL',
      'OOM_RISK',
      'CHROME_API_ERROR',
      'UNEXPECTED_ERROR',
    ];
    for (const code of expectedCodes) {
      expect(ErrorCodes).toHaveProperty(code, code);
    }
  });
});

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxRetries: 3, delay: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('retries on failure and succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    const result = await withRetry(fn, { maxRetries: 3, delay: 1, backoff: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws last error after all retries fail', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('persistent failure'));

    await expect(withRetry(fn, { maxRetries: 2, delay: 1, backoff: 1 })).rejects.toThrow('persistent failure');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('uses default options when none provided', async () => {
    const fn = vi.fn().mockResolvedValue('default');
    const result = await withRetry(fn);
    expect(result).toBe('default');
  });
});
