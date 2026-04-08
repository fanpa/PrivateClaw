import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getBuiltinTools } from '../../src/tools/registry.js';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = join(import.meta.dirname, '__test_registry_cs__');
const TEST_CONFIG = join(TEST_DIR, 'config.json');

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  writeFileSync(TEST_CONFIG, JSON.stringify({ skills: [] }, null, 2));
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('getBuiltinTools includes create_skill', () => {
  it('always includes create_skill when configPath is provided', () => {
    const tools = getBuiltinTools({ configPath: TEST_CONFIG, skillsDir: TEST_DIR });
    expect(tools['create_skill']).toBeDefined();
    expect(tools['create_skill'].execute).toBeTypeOf('function');
  });

  it('does not include create_skill when configPath is not provided', () => {
    const tools = getBuiltinTools({});
    expect(tools['create_skill']).toBeUndefined();
  });
});
