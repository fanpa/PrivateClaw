import { describe, it, expect } from 'vitest';
import { isDomainAllowed } from '../../src/security/domain-guard.js';

describe('isDomainAllowed', () => {
  const allowed = ['localhost', 'internal.corp.com', '192.168.1.100'];

  it('allows a whitelisted domain', () => {
    expect(isDomainAllowed('internal.corp.com', allowed)).toBe(true);
  });

  it('allows localhost', () => {
    expect(isDomainAllowed('localhost', allowed)).toBe(true);
  });

  it('allows whitelisted IP', () => {
    expect(isDomainAllowed('192.168.1.100', allowed)).toBe(true);
  });

  it('blocks a non-whitelisted domain', () => {
    expect(isDomainAllowed('evil.com', allowed)).toBe(false);
  });

  it('blocks subdomain of whitelisted domain (no wildcard)', () => {
    expect(isDomainAllowed('sub.internal.corp.com', allowed)).toBe(false);
  });

  it('allows all domains when allowedDomains is empty', () => {
    expect(isDomainAllowed('anything.com', [])).toBe(true);
  });
});
