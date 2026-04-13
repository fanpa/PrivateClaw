#!/usr/bin/env bun
/**
 * Build a standalone binary, auto-detecting optional dependencies to mark as --external.
 *
 * Usage: bun scripts/build-binary.ts <target> <outfile>
 *   target  - bun build target (e.g. bun-linux-x64, bun-darwin-arm64)
 *   outfile - output binary path
 *
 * Packages listed as optionalDependencies by any package in node_modules are
 * marked --external so bun skips bundling them (they aren't present at runtime).
 * Native modules like `electron` are always external.
 */

import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { spawnSync } from 'child_process'

// These can never be bundled regardless of optional status
const ALWAYS_EXTERNAL = ['electron']

function collectOptionalDeps(nodeModulesPath: string): Set<string> {
  const optional = new Set<string>()

  if (!existsSync(nodeModulesPath)) {
    return optional
  }

  for (const entry of readdirSync(nodeModulesPath)) {
    const entryPath = join(nodeModulesPath, entry)

    if (entry.startsWith('@')) {
      // scoped packages — one more level deep
      for (const sub of readdirSync(entryPath)) {
        addOptionalFromPackage(join(entryPath, sub, 'package.json'), optional)
      }
    } else {
      addOptionalFromPackage(join(entryPath, 'package.json'), optional)
    }
  }

  return optional
}

function addOptionalFromPackage(pkgJsonPath: string, target: Set<string>): void {
  if (!existsSync(pkgJsonPath)) return
  try {
    const data = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
    for (const name of Object.keys(data.optionalDependencies ?? {})) {
      target.add(name)
    }
  } catch {
    // Ignore malformed package.json
  }
}

const target = process.argv[2]
const outfile = process.argv[3]

if (!target || !outfile) {
  console.error('Usage: bun scripts/build-binary.ts <target> <outfile>')
  process.exit(1)
}

const nodeModules = join(process.cwd(), 'node_modules')
const optionalDeps = collectOptionalDeps(nodeModules)
const externalSet = new Set([...ALWAYS_EXTERNAL, ...optionalDeps])

const externalFlags = [...externalSet].map(dep => `--external=${dep}`)
const entrypoint = './dist/bin/privateclaw.js'

const cmd = [
  'bun', 'build', '--compile',
  `--target=${target}`,
  `--outfile=${outfile}`,
  ...externalFlags,
  entrypoint,
]

console.log(`Target:    ${target}`)
console.log(`Outfile:   ${outfile}`)
console.log(`Externals: ${[...externalSet].join(', ')}`)
console.log()
console.log('$', cmd.join(' '))
console.log()

const result = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit' })
process.exit(result.status ?? 1)
