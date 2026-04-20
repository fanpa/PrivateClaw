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
    expect(result.message).toContain('Updated');
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
    expect(result.message).toContain(String(content.length));
  });

  it('returns diff information when content changes', async () => {
    const filePath = join(TEST_DIR, 'diff-test.txt');
    writeFileSync(filePath, 'line1\nline2\nline3\n');
    const result = await fileUpdateTool.execute({
      filePath,
      content: 'line1\nmodified\nline3\nnewline\n',
    });
    expect(result.diff).toContain('-line2');
    expect(result.diff).toContain('+modified');
    expect(result.diff).toContain('+newline');
  });

  it('returns empty diff when content is unchanged', async () => {
    const filePath = join(TEST_DIR, 'nodiff.txt');
    writeFileSync(filePath, 'same content');
    const result = await fileUpdateTool.execute({
      filePath,
      content: 'same content',
    });
    expect(result.diff).toBe('');
  });

  it('emits unified-diff hunk headers', async () => {
    const filePath = join(TEST_DIR, 'hunk.txt');
    writeFileSync(filePath, 'a\nb\nc\nd\ne\n');
    const result = await fileUpdateTool.execute({
      filePath,
      content: 'a\nb\nCHANGED\nd\ne\n',
    });
    expect(result.diff).toMatch(/^@@ -\d+,\d+ \+\d+,\d+ @@/m);
    expect(result.diff).toContain('-c');
    expect(result.diff).toContain('+CHANGED');
    expect(result.diff).toContain(' b');
    expect(result.diff).toContain(' d');
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
      expect(result.message).toContain('Updated');
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
