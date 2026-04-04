import { describe, it, expect } from 'vitest';
import { createRestrictedFetch } from '../../src/security/restricted-fetch.js';

describe('createRestrictedFetch', () => {
  const restrictedFetch = createRestrictedFetch(['localhost']);

  it('blocks requests to non-whitelisted domains', async () => {
    await expect(
      restrictedFetch('https://evil.com/data')
    ).rejects.toThrow('Domain not allowed: evil.com');
  });

  it('blocks requests to non-whitelisted IPs', async () => {
    await expect(
      restrictedFetch('https://8.8.8.8/data')
    ).rejects.toThrow('Domain not allowed: 8.8.8.8');
  });

  it('allows all when no domains are configured', async () => {
    const openFetch = createRestrictedFetch([]);
    await expect(
      openFetch('http://localhost:99999/nonexistent')
    ).rejects.not.toThrow('Domain not allowed');
  });
});
