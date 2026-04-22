/**
 * Semver-lite: strict `major.minor.patch` with non-negative integers.
 * Pre-release tags (`-beta`, `+build`) and ranges are intentionally out of
 * scope — if a real conflict shows up later, swap in the `semver` package.
 */

export type VersionTuple = readonly [number, number, number];

export function parseVersion(v: string): VersionTuple | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  if (!match) return null;
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

/**
 * Returns >0 if a > b, <0 if a < b, 0 if equal.
 * Unparseable inputs default to 0 (treated as equal) so the caller defaults
 * to "do not touch" rather than overwriting on ambiguous data.
 */
export function compareVersions(a: string | undefined, b: string | undefined): number {
  if (!a || !b) return 0;
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}
