import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { fileWriteTool } from '../../src/tools/file-write.js';
import { assertToolStructure } from './helpers.js';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = join(import.meta.dirname, '__fixtures_write__');

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('fileWriteTool', () => {
  it('has correct name and description', () => {
    expect(fileWriteTool.name).toBe('file_write');
    expect(fileWriteTool.description).toBeDefined();
  });

  it('writes content to a new file', async () => {
    const filePath = join(TEST_DIR, 'output.txt');
    const result = await fileWriteTool.execute({ filePath, content: 'hello world' });
    expect(result).toContain('Written');
    expect(readFileSync(filePath, 'utf-8')).toBe('hello world');
  });

  it('overwrites an existing file', async () => {
    const filePath = join(TEST_DIR, 'existing.txt');
    await fileWriteTool.execute({ filePath, content: 'first' });
    await fileWriteTool.execute({ filePath, content: 'second' });
    expect(readFileSync(filePath, 'utf-8')).toBe('second');
  });
});

describe('fileWriteTool inputSchema and AI SDK path', () => {
  it('has valid tool structure with inputSchema', () => {
    assertToolStructure(fileWriteTool);
  });

  it('inputSchema accepts valid input', () => {
    const schema = fileWriteTool.tool.inputSchema as z.ZodSchema;
    const result = schema.parse({ filePath: '/foo/bar.txt', content: 'hello' });
    expect(result.filePath).toBe('/foo/bar.txt');
    expect(result.content).toBe('hello');
  });

  it('inputSchema rejects missing filePath', () => {
    const schema = fileWriteTool.tool.inputSchema as z.ZodSchema;
    expect(() => schema.parse({ content: 'hello' })).toThrow();
  });

  it('inputSchema rejects missing content', () => {
    const schema = fileWriteTool.tool.inputSchema as z.ZodSchema;
    expect(() => schema.parse({ filePath: '/foo/bar.txt' })).toThrow();
  });

  it('tool.execute works when called via inputSchema parse (AI SDK path)', async () => {
    const filePath = join(TEST_DIR, 'sdk-path.txt');
    const schema = fileWriteTool.tool.inputSchema as z.ZodSchema;
    const parsedInput = schema.parse({ filePath, content: 'sdk write test' });
    const result = await fileWriteTool.tool.execute(parsedInput, { toolCallId: 'test', messages: [] });
    expect(result).toContain('Written');
    expect(readFileSync(filePath, 'utf-8')).toBe('sdk write test');
  });
});
