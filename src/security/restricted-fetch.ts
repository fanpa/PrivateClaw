import { readFileSync } from 'node:fs';
import { isDomainAllowed } from './domain-guard.js';

export interface RestrictedFetchOptions {
  tlsSkipVerify?: boolean;
  tlsCaPath?: string;
}

export function createRestrictedFetch(
  allowedDomains: string[],
  options: RestrictedFetchOptions = {},
): typeof globalThis.fetch {
  // Read CA cert once at setup time so missing files fail fast
  const ca = options.tlsCaPath ? readFileSync(options.tlsCaPath) : undefined;

  return async (input, init?) => {
    const url = new URL(typeof input === 'string' ? input : (input as Request).url);
    if (!isDomainAllowed(url.hostname, allowedDomains)) {
      throw new Error(`Domain not allowed: ${url.hostname}`);
    }
    if (ca) {
      // tlsCaPath takes priority: trust the custom CA while keeping cert verification enabled
      // tls.ca is a Bun-specific fetch extension (ignored in Node.js)
      return globalThis.fetch(input, { ...init, tls: { ca } } as RequestInit);
    }
    if (options.tlsSkipVerify) {
      // Fallback: disable cert verification entirely (Bun-specific, ignored in Node.js)
      return globalThis.fetch(input, { ...init, tls: { rejectUnauthorized: false } } as RequestInit);
    }
    return globalThis.fetch(input, init);
  };
}
