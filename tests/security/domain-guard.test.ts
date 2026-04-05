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

  it('allows all domains when allowedDomains is empty', () => {
    expect(isDomainAllowed('anything.com', [])).toBe(true);
  });

  // Subdomain matching
  it('allows subdomain of whitelisted domain', () => {
    expect(isDomainAllowed('sub.internal.corp.com', allowed)).toBe(true);
  });

  it('allows deeply nested subdomain', () => {
    expect(isDomainAllowed('a.b.c.internal.corp.com', allowed)).toBe(true);
  });

  it('does not allow partial domain match', () => {
    // "notinternal.corp.com" should NOT match "internal.corp.com"
    expect(isDomainAllowed('notinternal.corp.com', allowed)).toBe(false);
  });

  // Wildcard matching
  it('allows subdomain with wildcard *.example.com', () => {
    const domains = ['*.example.com'];
    expect(isDomainAllowed('api.example.com', domains)).toBe(true);
    expect(isDomainAllowed('www.example.com', domains)).toBe(true);
    expect(isDomainAllowed('sub.api.example.com', domains)).toBe(true);
  });

  it('wildcard does not match the base domain itself', () => {
    const domains = ['*.example.com'];
    expect(isDomainAllowed('example.com', domains)).toBe(false);
  });

  it('google.com allows www.google.com and api.google.com', () => {
    const domains = ['google.com'];
    expect(isDomainAllowed('google.com', domains)).toBe(true);
    expect(isDomainAllowed('www.google.com', domains)).toBe(true);
    expect(isDomainAllowed('api.google.com', domains)).toBe(true);
    expect(isDomainAllowed('maps.google.com', domains)).toBe(true);
  });
});
