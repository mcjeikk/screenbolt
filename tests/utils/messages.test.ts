import { describe, it, expect } from 'vitest';
import { isValidMessage, isKnownAction } from '../../utils/messages.js';

describe('isValidMessage', () => {
  it('returns true for valid messages', () => {
    expect(isValidMessage({ action: 'capture-visible' })).toBe(true);
    expect(isValidMessage({ action: 'start-recording', config: {} })).toBe(true);
  });

  it('returns false for null/undefined', () => {
    expect(isValidMessage(null)).toBe(false);
    expect(isValidMessage(undefined)).toBe(false);
  });

  it('returns false for non-objects', () => {
    expect(isValidMessage('string')).toBe(false);
    expect(isValidMessage(42)).toBe(false);
    expect(isValidMessage(true)).toBe(false);
  });

  it('returns false for objects without action', () => {
    expect(isValidMessage({})).toBe(false);
    expect(isValidMessage({ type: 'foo' })).toBe(false);
  });

  it('returns false for empty action string', () => {
    expect(isValidMessage({ action: '' })).toBe(false);
  });

  it('returns false for non-string action', () => {
    expect(isValidMessage({ action: 42 })).toBe(false);
    expect(isValidMessage({ action: null })).toBe(false);
  });
});

describe('isKnownAction', () => {
  it('returns true for known message types', () => {
    expect(isKnownAction('capture-visible')).toBe(true);
    expect(isKnownAction('start-recording')).toBe(true);
  });

  it('returns false for unknown actions', () => {
    expect(isKnownAction('not-a-real-action')).toBe(false);
    expect(isKnownAction('')).toBe(false);
  });
});
