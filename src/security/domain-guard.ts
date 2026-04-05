export function isDomainAllowed(hostname: string, allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) return true;

  return allowedDomains.some((allowed) => {
    if (allowed.startsWith('*.')) {
      // Wildcard: *.example.com matches sub.example.com but not example.com
      const suffix = allowed.slice(1); // .example.com
      return hostname.endsWith(suffix);
    }
    // Exact match or subdomain match: example.com matches example.com, api.example.com, www.example.com
    return hostname === allowed || hostname.endsWith('.' + allowed);
  });
}
