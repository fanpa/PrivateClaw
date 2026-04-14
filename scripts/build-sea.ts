#!/usr/bin/env node
/**
 * Build a Node.js Single Executable Application (SEA) for macOS.
 *
 * Usage: node --experimental-sea-config sea-config.json && node scripts/build-sea.ts <outfile>
 *   Or simply: node scripts/build-sea.ts <outfile>  (runs blob generation internally)
 *
 * Steps:
 * 1. Generate SEA blob from the bundled JS
 * 2. Copy the Node.js binary
 * 3. Inject the blob into the binary using postject
 * 4. Ad-hoc codesign (macOS only)
 */

import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, unlinkSync } from 'node:fs';

const outfile = process.argv[2];
if (!outfile) {
  console.error('Usage: node scripts/build-sea.ts <outfile>');
  process.exit(1);
}

const nodePath = process.execPath;

console.log(`Node:    ${nodePath} (${process.version})`);
console.log(`Outfile: ${outfile}`);
console.log();

// 1. Generate blob
console.log('Step 1: Generating SEA blob...');
execSync('node --experimental-sea-config sea-config.json', { stdio: 'inherit' });

if (!existsSync('sea-prep.blob')) {
  console.error('Failed to generate sea-prep.blob');
  process.exit(1);
}

// 2. Copy node binary
console.log(`Step 2: Copying Node.js binary to ${outfile}...`);
copyFileSync(nodePath, outfile);
execSync(`chmod +x ${outfile}`);

// 3. Remove existing signature on macOS (required before postject)
if (process.platform === 'darwin') {
  console.log('Step 2.5: Removing existing signature...');
  execSync(`codesign --remove-signature ${outfile}`, { stdio: 'inherit' });
}

// 4. Inject blob
console.log('Step 3: Injecting SEA blob...');
const sentinelFuse = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
if (process.platform === 'darwin') {
  execSync(
    `npx postject ${outfile} NODE_SEA_BLOB sea-prep.blob --sentinel-fuse ${sentinelFuse} --macho-segment-name NODE_SEA`,
    { stdio: 'inherit' },
  );
} else {
  execSync(
    `npx postject ${outfile} NODE_SEA_BLOB sea-prep.blob --sentinel-fuse ${sentinelFuse}`,
    { stdio: 'inherit' },
  );
}

// 5. Codesign on macOS
if (process.platform === 'darwin') {
  console.log('Step 4: Ad-hoc codesigning...');
  execSync(`codesign --force --sign - ${outfile}`, { stdio: 'inherit' });
}

// 6. Cleanup
if (existsSync('sea-prep.blob')) {
  unlinkSync('sea-prep.blob');
}

console.log(`\nDone! ${outfile} is ready.`);
