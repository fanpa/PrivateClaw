import { isDomainAllowed } from './domain-guard.js';

export interface RestrictedFetchOptions {
  tlsSkipVerify?: boolean;
}

export function createRestrictedFetch(
  allowedDomains: string[],
  options: RestrictedFetchOptions = {},
): typeof globalThis.fetch {
  return async (input, init?) => {
    const url = new URL(typeof input === 'string' ? input : (input as Request).url);
    if (!isDomainAllowed(url.hostname, allowedDomains)) {
      throw new Error(`Domain not allowed: ${url.hostname}`);
    }
    if (options.tlsSkipVerify) {
      // tls.rejectUnauthorized is a Bun-specific fetch extension (ignored in Node.js)
      return globalThis.fetch(input, { ...init, tls: { rejectUnauthorized: false } } as RequestInit);
    }
    return globalThis.fetch(input, init);
  };
}
