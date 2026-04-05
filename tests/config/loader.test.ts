import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../../src/config/loader.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = join(import.meta.dirname, '__fixtures__');

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('loads a valid config file', () => {
    const configPath = join(TEST_DIR, 'valid.json');
    writeFileSync(configPath, JSON.stringify({
      provider: {
        type: 'openai',
        baseURL: 'http://localhost:8080/v1',
        apiKey: 'test-key',
        model: 'gpt-4o',
      },
    }));

    const config = loadConfig(configPath);
    expect(config.provider.type).toBe('openai');
    expect(config.provider.model).toBe('gpt-4o');
  });

  it('throws on missing config file', () => {
    expect(() => loadConfig('/nonexistent/path.json')).toThrow();
  });

  it('throws on invalid JSON', () => {
    const configPath = join(TEST_DIR, 'invalid.json');
    writeFileSync(configPath, '{ not valid json }');
    expect(() => loadConfig(configPath)).toThrow();
  });

  it('throws on invalid schema', () => {
    const configPath = join(TEST_DIR, 'bad-schema.json');
    writeFileSync(configPath, JSON.stringify({ provider: { type: 'invalid' } }));
    expect(() => loadConfig(configPath)).toThrow();
  });
});
