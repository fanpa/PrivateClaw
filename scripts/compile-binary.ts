#!/usr/bin/env bun
/**
 * Wraps `bun build --compile`, automatically marking uninstalled optional deps
 * as --external so CI never fails because a platform-specific optional package
 * isn't present in node_modules.
 *
 * Logic:
 *   - Scans every package.json under node_modules for optionalDependencies.
 *   - A dep is considered "installed" if it exists as a top-level symlink OR
 *     appears in the pnpm virtual store (.pnpm/<name>@*).
 *   - Uninstalled optional deps → --external (bun skips bundling them).
 *   - Installed optional deps → bundled normally (self-contained binary).
 *   - ALWAYS_EXTERNAL deps are excluded unconditionally (e.g. electron).
 *
 * Usage:
 *   bun run scripts/compile-binary.ts --target=<target> --outfile=<outfile> <entrypoint>
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// Deps that should never be bundled regardless of install status.
// electron is a large platform binary that has no place in a bundled CLI.
const ALWAYS_EXTERNAL = ['electron'];

const args = process.argv.slice(2);
const targetArg = args.find((a) => a.startsWith('--target='));
const outfileArg = args.find((a) => a.startsWith('--outfile='));
const entrypoint = args.find((a) => !a.startsWith('--'));

if (!targetArg || !outfileArg || !entrypoint) {
  console.error(
    'Usage: bun run scripts/compile-binary.ts --target=<target> --outfile=<outfile> <entrypoint>',
  );
  process.exit(1);
}

/**
 * Check whether a package is available for bundling.
 * Handles both flat (npm/yarn) and pnpm virtual-store layouts.
 */
function isDepInstalled(dep: string, nodeModules: string): boolean {
  // Flat layout: node_modules/<dep>
  if (existsSync(join(nodeModules, dep))) return true;

  // pnpm virtual store: node_modules/.pnpm/<dep>@<version>[_...]/...
  // Scoped packages are stored as @scope+name@version
  const pnpmDir = join(nodeModules, '.pnpm');
  if (!existsSync(pnpmDir)) return false;

  const prefix = dep.startsWith('@')
    ? dep.replace('/', '+') + '@'  // @scope/pkg → @scope+pkg@
    : dep + '@';

  try {
    return readdirSync(pnpmDir).some((entry) => entry.startsWith(prefix));
  } catch {
    return false;
  }
}

/**
 * Collect all optionalDependencies keys from every package.json in node_modules
 * (top-level entries only; scoped packages under @scope/pkg are also handled).
 */
function collectOptionalDeps(nodeModules: string): Set<string> {
  const result = new Set<string>();

  function scanDir(dir: string, isScope = false) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.startsWith('.')) continue;

      if (!isScope && entry.startsWith('@')) {
        // Scoped namespace directory — recurse one level
        scanDir(join(dir, entry), true);
        continue;
      }

      const pkgJsonPath = join(dir, entry, 'package.json');
      try {
        const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
        for (const dep of Object.keys(pkg.optionalDependencies ?? {})) {
          result.add(dep);
        }
      } catch {
        // Ignore missing / malformed package.json
      }
    }
  }

  scanDir(nodeModules);
  return result;
}

const nodeModules = join(process.cwd(), 'node_modules');
const allOptionals = collectOptionalDeps(nodeModules);

// Only mark as external if the package is NOT installed.
// Installed optional deps can be bundled → fully self-contained binary.
const uninstalledOptionals = [...allOptionals].filter(
  (dep) => !isDepInstalled(dep, nodeModules),
);

const externalFlags = [
  ...ALWAYS_EXTERNAL,
  ...uninstalledOptionals,
].map((dep) => `--external=${dep}`);

if (externalFlags.length > 0) {
  console.log(`[compile-binary] external flags: ${externalFlags.join(' ')}`);
} else {
  console.log('[compile-binary] no external flags needed');
}

const cmd = [
  'bun',
  'build',
  '--compile',
  targetArg,
  outfileArg,
  ...externalFlags,
  entrypoint,
].join(' ');

console.log(`[compile-binary] running: ${cmd}`);
execSync(cmd, { stdio: 'inherit' });
