import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createWebFetchTool } from '../../src/tools/web-fetch.js';
import { assertToolStructure } from './helpers.js';

describe('createWebFetchTool', () => {
  it('has correct name and description', () => {
    const webFetch = createWebFetchTool(globalThis.fetch);
    expect(webFetch.name).toBe('web_fetch');
    expect(webFetch.description).toBeDefined();
  });

  it('fetches a URL using the provided fetch function', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<html>Hello</html>',
    });

    const webFetch = createWebFetchTool(mockFetch as unknown as typeof fetch);
    const result = await webFetch.execute({ url: 'https://example.com' });

    expect(mockFetch).toHaveBeenCalledWith('https://example.com');
    expect(result.status).toBe(200);
    expect(result.body).toBe('<html>Hello</html>');
  });

  it('returns error info when fetch fails', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Domain not allowed: evil.com'));

    const webFetch = createWebFetchTool(mockFetch as unknown as typeof fetch);
    const result = await webFetch.execute({ url: 'https://evil.com' });

    expect(result.error).toContain('Domain not allowed: evil.com');
  });

  it('returns error info on non-ok response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    });

    const webFetch = createWebFetchTool(mockFetch as unknown as typeof fetch);
    const result = await webFetch.execute({ url: 'https://example.com/missing' });

    expect(result.status).toBe(404);
    expect(result.body).toBe('Not Found');
  });

  it('respects restricted fetch (integration with domain guard)', async () => {
    const { createRestrictedFetch } = await import('../../src/security/restricted-fetch.js');
    const restricted = createRestrictedFetch(['localhost']);

    const webFetch = createWebFetchTool(restricted);
    const result = await webFetch.execute({ url: 'https://blocked.com/data' });

    expect(result.error).toContain('Domain not allowed: blocked.com');
  });

  it('includes error cause in message', async () => {
    const cause = new Error('getaddrinfo ENOTFOUND example.com');
    const fetchError = new Error('fetch failed');
    fetchError.cause = cause;
    const mockFetch = vi.fn().mockRejectedValue(fetchError);

    const webFetch = createWebFetchTool(mockFetch as unknown as typeof fetch);
    const result = await webFetch.execute({ url: 'https://example.com' });

    expect(result.error).toContain('fetch failed');
    expect(result.error).toContain('getaddrinfo ENOTFOUND');
  });

  describe('tool object (AI SDK path)', () => {
    it('has inputSchema defined on tool object', () => {
      const webFetch = createWebFetchTool(globalThis.fetch);
      expect(webFetch.tool.inputSchema).toBeDefined();
    });

    it('inputSchema parses valid input', () => {
      const webFetch = createWebFetchTool(globalThis.fetch);
      const schema = webFetch.tool.inputSchema as import('zod').ZodSchema;
      const result = schema.parse({ url: 'https://example.com' });
      expect(result.url).toBe('https://example.com');
    });

    it('inputSchema rejects missing url', () => {
      const webFetch = createWebFetchTool(globalThis.fetch);
      const schema = webFetch.tool.inputSchema as import('zod').ZodSchema;
      expect(() => schema.parse({})).toThrow();
    });

    it('tool.execute works via inputSchema parse (simulates AI SDK call)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => 'sdk fetch result',
      });
      const webFetch = createWebFetchTool(mockFetch as unknown as typeof fetch);
      const schema = webFetch.tool.inputSchema as import('zod').ZodSchema;
      const parsedInput = schema.parse({ url: 'https://example.com' });
      const result = await webFetch.tool.execute(parsedInput, { toolCallId: 'test', messages: [] } as never);
      expect(result.body).toBe('sdk fetch result');
    });
  });
});

describe('createWebFetchTool inputSchema and AI SDK path', () => {
  it('has valid tool structure with inputSchema', () => {
    const webFetch = createWebFetchTool(globalThis.fetch);
    assertToolStructure(webFetch);
  });

  it('inputSchema accepts valid url', () => {
    const webFetch = createWebFetchTool(globalThis.fetch);
    const schema = webFetch.tool.inputSchema as z.ZodSchema;
    const result = schema.parse({ url: 'https://example.com' });
    expect(result.url).toBe('https://example.com');
  });

  it('inputSchema rejects missing url', () => {
    const webFetch = createWebFetchTool(globalThis.fetch);
    const schema = webFetch.tool.inputSchema as z.ZodSchema;
    expect(() => schema.parse({})).toThrow();
  });

  it('tool.execute works when called via inputSchema parse (AI SDK path)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'sdk fetch test',
    });
    const webFetch = createWebFetchTool(mockFetch as unknown as typeof fetch);
    const schema = webFetch.tool.inputSchema as z.ZodSchema;
    const parsedInput = schema.parse({ url: 'https://example.com' });
    const result = await webFetch.tool.execute(parsedInput, { toolCallId: 'test', messages: [] });
    expect(result.body).toBe('sdk fetch test');
  });
});
