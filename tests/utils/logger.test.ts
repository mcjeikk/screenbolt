// tests/utils/logger.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Re-import fresh module per test by using dynamic import + vi.resetModules
type LoggerModule = typeof import('../../utils/logger.js');
let createLogger: LoggerModule['createLogger'];
let getErrorLog: LoggerModule['getErrorLog'];
let clearErrorLog: LoggerModule['clearErrorLog'];
let LOG_LEVELS: LoggerModule['LOG_LEVELS'];

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  // Suppress console output during tests
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});

  const mod = await import('../../utils/logger.js');
  createLogger = mod.createLogger;
  getErrorLog = mod.getErrorLog;
  clearErrorLog = mod.clearErrorLog;
  LOG_LEVELS = mod.LOG_LEVELS;
});

describe('Error buffer', () => {
  it('captures WARN entries in buffer', () => {
    const log = createLogger('TestModule');
    log.warn('something went wrong');
    const entries = getErrorLog();
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe('WARN');
    expect(entries[0].module).toBe('TestModule');
    expect(entries[0].message).toContain('something went wrong');
  });

  it('captures ERROR entries in buffer', () => {
    const log = createLogger('TestModule');
    log.error('critical failure', new Error('boom'));
    const entries = getErrorLog();
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe('ERROR');
    expect(entries[0].message).toContain('critical failure');
    expect(entries[0].message).toContain('boom');
  });

  it('does NOT capture INFO or DEBUG in buffer', () => {
    const log = createLogger('TestModule');
    log.setLevel(LOG_LEVELS.DEBUG);
    log.debug('debug msg');
    log.info('info msg');
    expect(getErrorLog()).toHaveLength(0);
  });

  it('evicts oldest entry when exceeding max size', () => {
    const log = createLogger('TestModule');
    for (let i = 0; i < 55; i++) {
      log.warn(`warning ${i}`);
    }
    const entries = getErrorLog();
    expect(entries).toHaveLength(50);
    expect(entries[0].message).toContain('warning 5');
    expect(entries[49].message).toContain('warning 54');
  });

  it('getErrorLog returns a copy of the buffer', () => {
    const log = createLogger('TestModule');
    log.warn('test');
    const a = getErrorLog();
    const b = getErrorLog();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it('clearErrorLog empties buffer and calls storage.remove', async () => {
    const log = createLogger('TestModule');
    log.warn('test');
    expect(getErrorLog()).toHaveLength(1);
    await clearErrorLog();
    expect(getErrorLog()).toHaveLength(0);
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('errorLog');
  });

  it('ERROR level triggers immediate flush to storage', () => {
    vi.mocked(chrome.storage.local.set).mockClear();
    const log = createLogger('TestModule');
    log.error('critical');
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ errorLog: expect.any(Array) }),
    );
  });

  it('WARN level flush is debounced', () => {
    vi.useFakeTimers();
    vi.mocked(chrome.storage.local.set).mockClear();
    const log = createLogger('TestModule');
    log.warn('deferred');
    // Not flushed immediately
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    // Flush after debounce period
    vi.advanceTimersByTime(5000);
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ errorLog: expect.any(Array) }),
    );
    vi.useRealTimers();
  });
});
