import { describe, it, expect } from 'vitest';
import { compareVersions } from '../../utils/migration.js';

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.5.1', '0.5.1')).toBe(0);
  });

  it('returns -1 when a < b', () => {
    expect(compareVersions('0.3.0', '0.4.0')).toBe(-1);
    expect(compareVersions('0.4.0', '0.5.0')).toBe(-1);
    expect(compareVersions('0.4.9', '0.5.0')).toBe(-1);
    expect(compareVersions('0.0.1', '0.0.2')).toBe(-1);
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
  });

  it('returns 1 when a > b', () => {
    expect(compareVersions('0.5.0', '0.4.0')).toBe(1);
    expect(compareVersions('1.0.0', '0.9.9')).toBe(1);
    expect(compareVersions('0.8.8', '0.7.0')).toBe(1);
  });

  it('handles versions with different lengths', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0', '1.0.1')).toBe(-1);
    expect(compareVersions('1.1', '1.0.1')).toBe(1);
  });

  it('handles single-segment versions', () => {
    expect(compareVersions('1', '2')).toBe(-1);
    expect(compareVersions('2', '1')).toBe(1);
    expect(compareVersions('1', '1')).toBe(0);
  });
});
