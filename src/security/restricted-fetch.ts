import { readFileSync } from 'node:fs';
import { normalize } from 'node:path';
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
  let ca: string | undefined;
  if (options.tlsCaPath) {
    const normalizedPath = normalize(options.tlsCaPath);
    try {
      ca = readFileSync(normalizedPath, 'utf-8');
    } catch (err) {
      throw new Error(
        `Failed to read TLS CA certificate from "${normalizedPath}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    // Set NODE_EXTRA_CA_CERTS so all HTTPS connections in this process trust the custom CA,
    // including connections made by the AI SDK and other native TLS code (not just fetch).
    // Must be set before any TLS connections are established.
    process.env.NODE_EXTRA_CA_CERTS = normalizedPath;
  }

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
