import { describe, it, expect } from 'vitest';
import { compareVersions, parseVersion } from '../../src/skills/version.js';

describe('parseVersion', () => {
  it('parses well-formed major.minor.patch', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion('0.0.0')).toEqual([0, 0, 0]);
    expect(parseVersion('10.20.30')).toEqual([10, 20, 30]);
  });

  it('trims whitespace', () => {
    expect(parseVersion('  1.2.3  ')).toEqual([1, 2, 3]);
  });

  it('returns null for malformed input', () => {
    expect(parseVersion('')).toBeNull();
    expect(parseVersion('1.2')).toBeNull();
    expect(parseVersion('1.2.3.4')).toBeNull();
    expect(parseVersion('1.2.3-beta')).toBeNull();
    expect(parseVersion('v1.2.3')).toBeNull();
    expect(parseVersion('x.y.z')).toBeNull();
  });
});

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it('returns positive when a > b', () => {
    expect(compareVersions('1.2.4', '1.2.3')).toBeGreaterThan(0);
    expect(compareVersions('1.3.0', '1.2.9')).toBeGreaterThan(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
  });

  it('returns negative when a < b', () => {
    expect(compareVersions('1.2.3', '1.2.4')).toBeLessThan(0);
    expect(compareVersions('1.2.9', '1.3.0')).toBeLessThan(0);
  });

  it('treats undefined or missing versions as equal (do-not-touch default)', () => {
    expect(compareVersions(undefined, '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', undefined)).toBe(0);
    expect(compareVersions(undefined, undefined)).toBe(0);
  });

  it('treats unparseable versions as equal', () => {
    expect(compareVersions('garbage', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', 'garbage')).toBe(0);
    expect(compareVersions('1.0.0-beta', '1.0.0')).toBe(0);
  });
});
