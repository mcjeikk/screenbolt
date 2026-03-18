import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getTimestamp,
  formatFileSize,
  formatDuration,
  sanitizeFilename,
  debounce,
  throttle,
  estimateDataUrlSize,
  base64ToBytes,
  isCapturableUrl,
} from '../../utils/helpers.js';

describe('getTimestamp', () => {
  it('returns a string in YYYY-MM-DD_HH-MM-SS format', () => {
    const ts = getTimestamp();
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
  });

  it('uses the current date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-16T14:30:05'));
    expect(getTimestamp()).toBe('2026-03-16_14-30-05');
    vi.useRealTimers();
  });

  it('pads single-digit months and days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-05T09:03:07'));
    expect(getTimestamp()).toBe('2026-01-05_09-03-07');
    vi.useRealTimers();
  });
});

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1023)).toBe('1023 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(1024 * 500)).toBe('500.0 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatFileSize(1024 * 1024 * 5.5)).toBe('5.5 MB');
  });

  it('formats gigabytes', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.00 GB');
    expect(formatFileSize(1024 * 1024 * 1024 * 2.5)).toBe('2.50 GB');
  });
});

describe('formatDuration', () => {
  it('formats zero seconds', () => {
    expect(formatDuration(0)).toBe('00:00');
  });

  it('formats seconds only', () => {
    expect(formatDuration(45)).toBe('00:45');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(154)).toBe('02:34');
  });

  it('handles large durations', () => {
    expect(formatDuration(3661)).toBe('61:01');
  });

  it('floors fractional seconds', () => {
    expect(formatDuration(59.9)).toBe('00:59');
  });
});

describe('sanitizeFilename', () => {
  it('returns "untitled" for empty input', () => {
    expect(sanitizeFilename('')).toBe('untitled');
    expect(sanitizeFilename(null as unknown as string)).toBe('untitled');
    expect(sanitizeFilename(undefined as unknown as string)).toBe('untitled');
  });

  it('removes unsafe characters', () => {
    expect(sanitizeFilename('file<name>.txt')).toBe('filename.txt');
    expect(sanitizeFilename('path/to\\file')).toBe('pathtofile');
    expect(sanitizeFilename('file:name')).toBe('filename');
  });

  it('replaces spaces with underscores', () => {
    expect(sanitizeFilename('my file name')).toBe('my_file_name');
    expect(sanitizeFilename('lots   of   spaces')).toBe('lots_of_spaces');
  });

  it('truncates to 200 characters', () => {
    const longName = 'a'.repeat(300);
    expect(sanitizeFilename(longName).length).toBe(200);
  });

  it('returns "untitled" for names with only unsafe characters', () => {
    expect(sanitizeFilename('<>:"/\\|?*')).toBe('untitled');
  });
});

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('delays function execution', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('resets delay on subsequent calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    vi.advanceTimersByTime(50);
    debounced(); // reset
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('passes arguments to the original function', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('a', 'b');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith('a', 'b');
  });
});

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('executes immediately on first call', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    expect(fn).toHaveBeenCalledOnce();
  });

  it('throttles subsequent calls', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    throttled();
    throttled();
    expect(fn).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2); // trailing call
  });
});

describe('estimateDataUrlSize', () => {
  it('returns 0 for invalid input', () => {
    expect(estimateDataUrlSize('')).toBe(0);
    expect(estimateDataUrlSize(null as unknown as string)).toBe(0);
    expect(estimateDataUrlSize('no-comma')).toBe(0);
  });

  it('estimates size from base64 data URL', () => {
    // 4 base64 chars = 3 bytes
    const dataUrl = 'data:image/png;base64,AAAA';
    expect(estimateDataUrlSize(dataUrl)).toBe(3);
  });

  it('handles longer data URLs', () => {
    const base64Part = 'A'.repeat(400);
    const dataUrl = `data:image/png;base64,${base64Part}`;
    expect(estimateDataUrlSize(dataUrl)).toBe(300);
  });
});

describe('base64ToBytes', () => {
  it('converts base64 string to Uint8Array', () => {
    const base64 = btoa('hello');
    const bytes = base64ToBytes(base64);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(5);
    expect(String.fromCharCode(...bytes)).toBe('hello');
  });

  it('handles empty string', () => {
    const bytes = base64ToBytes(btoa(''));
    expect(bytes.length).toBe(0);
  });
});

describe('isCapturableUrl', () => {
  it('returns false for invalid input', () => {
    expect(isCapturableUrl('')).toBe(false);
    expect(isCapturableUrl(null as unknown as string)).toBe(false);
    expect(isCapturableUrl(undefined as unknown as string)).toBe(false);
  });

  it('returns false for restricted URLs', () => {
    expect(isCapturableUrl('chrome://extensions/')).toBe(false);
    expect(isCapturableUrl('chrome-extension://abc/popup.html')).toBe(false);
    expect(isCapturableUrl('about:blank')).toBe(false);
    expect(isCapturableUrl('edge://settings')).toBe(false);
  });

  it('returns true for regular web URLs', () => {
    expect(isCapturableUrl('https://example.com')).toBe(true);
    expect(isCapturableUrl('http://localhost:3000')).toBe(true);
    expect(isCapturableUrl('file:///home/user/doc.html')).toBe(true);
  });
});
