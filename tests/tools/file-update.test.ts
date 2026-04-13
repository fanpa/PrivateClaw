import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fileUpdateTool } from '../../src/tools/file-update.js';
import { readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = join(import.meta.dirname, '__fixtures_update__');

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('fileUpdateTool', () => {
  it('has correct name and description', () => {
    expect(fileUpdateTool.name).toBe('file_update');
    expect(fileUpdateTool.description).toBeDefined();
  });

  it('updates an existing file', async () => {
    const filePath = join(TEST_DIR, 'existing.txt');
    writeFileSync(filePath, 'original content');
    const result = await fileUpdateTool.execute({ filePath, content: 'updated content' });
    expect(result).toContain('Updated');
    expect(readFileSync(filePath, 'utf-8')).toBe('updated content');
  });

  it('throws if file does not exist', async () => {
    const filePath = join(TEST_DIR, 'nonexistent.txt');
    await expect(fileUpdateTool.execute({ filePath, content: 'data' })).rejects.toThrow();
  });

  it('returns byte count in result message', async () => {
    const filePath = join(TEST_DIR, 'counted.txt');
    writeFileSync(filePath, 'old');
    const content = 'new content here';
    const result = await fileUpdateTool.execute({ filePath, content });
    expect(result).toContain(String(content.length));
  });

  describe('tool object (AI SDK path)', () => {
    it('has inputSchema defined on tool object', () => {
      expect(fileUpdateTool.tool.inputSchema).toBeDefined();
    });

    it('inputSchema parses valid input', () => {
      const schema = fileUpdateTool.tool.inputSchema as import('zod').ZodSchema;
      const result = schema.parse({ filePath: '/file.txt', content: 'hello' });
      expect(result.filePath).toBe('/file.txt');
      expect(result.content).toBe('hello');
    });

    it('inputSchema rejects missing filePath', () => {
      const schema = fileUpdateTool.tool.inputSchema as import('zod').ZodSchema;
      expect(() => schema.parse({ content: 'hello' })).toThrow();
    });

    it('inputSchema rejects missing content', () => {
      const schema = fileUpdateTool.tool.inputSchema as import('zod').ZodSchema;
      expect(() => schema.parse({ filePath: '/file.txt' })).toThrow();
    });

    it('tool.execute updates existing file (simulates AI SDK call)', async () => {
      const filePath = join(TEST_DIR, 'sdk-update.txt');
      writeFileSync(filePath, 'old');
      const schema = fileUpdateTool.tool.inputSchema as import('zod').ZodSchema;
      const parsedInput = schema.parse({ filePath, content: 'sdk update' });
      const result = await fileUpdateTool.tool.execute(parsedInput, {
        toolCallId: 'test',
        messages: [],
      } as never);
      expect(result).toContain('Updated');
      expect(readFileSync(filePath, 'utf-8')).toBe('sdk update');
    });

    it('tool.execute throws for nonexistent file (simulates AI SDK call)', async () => {
      const filePath = join(TEST_DIR, 'no-file.txt');
      const schema = fileUpdateTool.tool.inputSchema as import('zod').ZodSchema;
      const parsedInput = schema.parse({ filePath, content: 'data' });
      await expect(
        fileUpdateTool.tool.execute(parsedInput, { toolCallId: 'test', messages: [] } as never),
      ).rejects.toThrow();
    });
  });
});
