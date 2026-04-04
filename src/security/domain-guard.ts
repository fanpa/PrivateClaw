export function isDomainAllowed(hostname: string, allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) return true;
  return allowedDomains.includes(hostname);
}
