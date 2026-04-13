import { describe, it, expect, vi } from 'vitest';
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

  describe('tlsSkipVerify option', () => {
    it('passes tls.rejectUnauthorized:false in fetch init when tlsSkipVerify is true', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch;

      try {
        const fetchFn = createRestrictedFetch(['example.com'], { tlsSkipVerify: true });
        await fetchFn('https://example.com/api');
        expect(mockFetch).toHaveBeenCalledWith(
          'https://example.com/api',
          expect.objectContaining({ tls: { rejectUnauthorized: false } }),
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('does not pass tls options when tlsSkipVerify is false', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch;

      try {
        const fetchFn = createRestrictedFetch(['example.com'], { tlsSkipVerify: false });
        await fetchFn('https://example.com/api');
        const [, init] = mockFetch.mock.calls[0] as [unknown, RequestInit | undefined];
        // init is undefined when tlsSkipVerify is false — no tls options injected
        expect(init == null || !Object.prototype.hasOwnProperty.call(init, 'tls')).toBe(true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('does not pass tls options when no options provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch;

      try {
        const fetchFn = createRestrictedFetch(['example.com']);
        await fetchFn('https://example.com/api');
        const [, init] = mockFetch.mock.calls[0] as [unknown, RequestInit | undefined];
        expect(init).toBeUndefined();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
