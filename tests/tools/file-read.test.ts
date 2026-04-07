import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { fileReadTool } from '../../src/tools/file-read.js';
import { assertToolStructure } from './helpers.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { asSchema } from 'ai';

const TEST_DIR = join(import.meta.dirname, '__fixtures_read__');

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('fileReadTool', () => {
  it('has correct name and description', () => {
    expect(fileReadTool.name).toBe('file_read');
    expect(fileReadTool.description).toBeDefined();
  });

  it('reads an existing file', async () => {
    const filePath = join(TEST_DIR, 'test.txt');
    writeFileSync(filePath, 'hello world');

    const result = await fileReadTool.execute({ filePath });
    expect(result).toBe('hello world');
  });

  it('throws on non-existent file', async () => {
    await expect(
      fileReadTool.execute({ filePath: '/nonexistent/file.txt' })
    ).rejects.toThrow();
  });

  describe('tool.inputSchema', () => {
    it('exposes inputSchema (not parameters) for AI SDK compatibility', () => {
      expect(fileReadTool.tool).toHaveProperty('inputSchema');
      expect(fileReadTool.tool).not.toHaveProperty('parameters');
    });

    it('inputSchema validates filePath correctly', async () => {
      const schema = asSchema(fileReadTool.tool.inputSchema);
      const valid = await schema.validate({ filePath: '/tmp/test.txt' });
      expect(valid).toMatchObject({ success: true, value: { filePath: '/tmp/test.txt' } });
    });

    it('inputSchema rejects missing filePath (no undefined path passed to readFile)', async () => {
      const schema = asSchema(fileReadTool.tool.inputSchema);
      const invalid = await schema.validate({});
      expect(invalid).toMatchObject({ success: false });
    });

    it('tool.execute reads file using filePath from inputSchema', async () => {
      const filePath = join(TEST_DIR, 'sdk-test.txt');
      writeFileSync(filePath, 'sdk content');
      const result = await fileReadTool.tool.execute({ filePath }, {} as never);
      expect(result).toBe('sdk content');
    });
  });
});

describe('fileReadTool inputSchema and AI SDK path', () => {
  it('has valid tool structure with inputSchema', () => {
    assertToolStructure(fileReadTool);
  });

  it('inputSchema accepts valid input', () => {
    const schema = fileReadTool.tool.inputSchema as z.ZodSchema;
    const result = schema.parse({ filePath: '/some/file.txt' });
    expect(result.filePath).toBe('/some/file.txt');
  });

  it('inputSchema rejects missing filePath', () => {
    const schema = fileReadTool.tool.inputSchema as z.ZodSchema;
    expect(() => schema.parse({})).toThrow();
  });

  it('inputSchema rejects non-string filePath', () => {
    const schema = fileReadTool.tool.inputSchema as z.ZodSchema;
    expect(() => schema.parse({ filePath: 123 })).toThrow();
  });

  it('tool.execute works when called via inputSchema parse (AI SDK path)', async () => {
    const filePath = join(import.meta.dirname, '__fixtures_read__', 'sdk-path.txt');
    mkdirSync(join(import.meta.dirname, '__fixtures_read__'), { recursive: true });
    writeFileSync(filePath, 'sdk path test');

    try {
      const schema = fileReadTool.tool.inputSchema as z.ZodSchema;
      const parsedInput = schema.parse({ filePath });
      const result = await fileReadTool.tool.execute(parsedInput, { toolCallId: 'test', messages: [] });
      expect(result).toBe('sdk path test');
    } finally {
      rmSync(filePath, { force: true });
    }
  });
});
