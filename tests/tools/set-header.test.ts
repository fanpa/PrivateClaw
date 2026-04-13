import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSetHeaderTool } from '../../src/tools/set-header.js';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = join(import.meta.dirname, '__test_set_header__');
const TEST_CONFIG = join(TEST_DIR, 'config.json');

const baseConfig = {
  security: { defaultHeaders: {} },
};

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  writeFileSync(TEST_CONFIG, JSON.stringify(baseConfig, null, 2));
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('createSetHeaderTool', () => {
  it('has correct name', () => {
    const tool = createSetHeaderTool(TEST_CONFIG);
    expect(tool.name).toBe('set_header');
  });

  it('sets headers for a domain', async () => {
    const tool = createSetHeaderTool(TEST_CONFIG);
    const result = await tool.execute({
      domain: 'api.company.com',
      headers: { Authorization: 'Bearer token123' },
    });

    expect(result.success).toBe(true);
    const config = JSON.parse(readFileSync(TEST_CONFIG, 'utf-8'));
    expect(config.security.defaultHeaders['api.company.com'].Authorization).toBe('Bearer token123');
  });

  it('merges with existing headers', async () => {
    writeFileSync(TEST_CONFIG, JSON.stringify({
      security: {
        defaultHeaders: {
          'api.company.com': { 'X-Existing': 'keep' },
        },
      },
    }, null, 2));

    const tool = createSetHeaderTool(TEST_CONFIG);
    await tool.execute({
      domain: 'api.company.com',
      headers: { Authorization: 'Bearer new' },
    });

    const config = JSON.parse(readFileSync(TEST_CONFIG, 'utf-8'));
    expect(config.security.defaultHeaders['api.company.com']['X-Existing']).toBe('keep');
    expect(config.security.defaultHeaders['api.company.com'].Authorization).toBe('Bearer new');
  });

  it('overrides existing header value', async () => {
    writeFileSync(TEST_CONFIG, JSON.stringify({
      security: {
        defaultHeaders: {
          'api.company.com': { Authorization: 'Bearer old' },
        },
      },
    }, null, 2));

    const tool = createSetHeaderTool(TEST_CONFIG);
    await tool.execute({
      domain: 'api.company.com',
      headers: { Authorization: 'Bearer new' },
    });

    const config = JSON.parse(readFileSync(TEST_CONFIG, 'utf-8'));
    expect(config.security.defaultHeaders['api.company.com'].Authorization).toBe('Bearer new');
  });

  it('returns error if config does not exist', async () => {
    const tool = createSetHeaderTool('/nonexistent/config.json');
    const result = await tool.execute({
      domain: 'test.com',
      headers: { Auth: 'x' },
    });
    expect(result.error).toContain('Config file not found');
  });

  it('sets multiple headers at once', async () => {
    const tool = createSetHeaderTool(TEST_CONFIG);
    await tool.execute({
      domain: 'api.company.com',
      headers: {
        Authorization: 'Bearer token',
        'User-Agent': 'PrivateClaw/1.0',
        Cookie: 'session=abc123',
      },
    });

    const config = JSON.parse(readFileSync(TEST_CONFIG, 'utf-8'));
    const h = config.security.defaultHeaders['api.company.com'];
    expect(h.Authorization).toBe('Bearer token');
    expect(h['User-Agent']).toBe('PrivateClaw/1.0');
    expect(h.Cookie).toBe('session=abc123');
  });

  describe('tool object (AI SDK path)', () => {
    it('has inputSchema defined', () => {
      const tool = createSetHeaderTool(TEST_CONFIG);
      expect(tool.tool.inputSchema).toBeDefined();
    });

    it('tool.execute works via AI SDK path', async () => {
      const tool = createSetHeaderTool(TEST_CONFIG);
      const result = await tool.tool.execute(
        { domain: 'test.com', headers: { Auth: 'x' } },
        { toolCallId: 'test', messages: [] } as never,
      );
      expect(result.success).toBe(true);
    });
  });
});
