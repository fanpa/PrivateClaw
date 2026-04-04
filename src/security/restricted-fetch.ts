import { isDomainAllowed } from './domain-guard.js';

export function createRestrictedFetch(
  allowedDomains: string[],
): typeof globalThis.fetch {
  return async (input, init?) => {
    const url = new URL(typeof input === 'string' ? input : (input as Request).url);
    if (!isDomainAllowed(url.hostname, allowedDomains)) {
      throw new Error(`Domain not allowed: ${url.hostname}`);
    }
    return globalThis.fetch(input, init);
  };
}
