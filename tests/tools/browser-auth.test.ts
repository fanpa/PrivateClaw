import { describe, it, expect } from 'vitest';
import { createBrowserAuthTool } from '../../src/tools/browser-auth.js';

describe('createBrowserAuthTool', () => {
  it('has correct name', () => {
    const tool = createBrowserAuthTool('/fake/config.json');
    expect(tool.name).toBe('browser_auth');
  });

  it('has inputSchema defined', () => {
    const tool = createBrowserAuthTool('/fake/config.json');
    expect(tool.tool.inputSchema).toBeDefined();
  });

  it('inputSchema parses valid input', () => {
    const tool = createBrowserAuthTool('/fake/config.json');
    const schema = tool.tool.inputSchema as import('zod').ZodSchema;
    const parsed = schema.parse({ url: 'https://example.com/login' });
    expect(parsed.url).toBe('https://example.com/login');
  });

  it('inputSchema parses input with extraHeaders', () => {
    const tool = createBrowserAuthTool('/fake/config.json');
    const schema = tool.tool.inputSchema as import('zod').ZodSchema;
    const parsed = schema.parse({
      url: 'https://example.com/login',
      extraHeaders: { 'User-Agent': 'Bot/1.0' },
    });
    expect(parsed.extraHeaders).toEqual({ 'User-Agent': 'Bot/1.0' });
  });
});
