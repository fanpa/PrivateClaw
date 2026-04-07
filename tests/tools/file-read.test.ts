import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fileReadTool } from '../../src/tools/file-read.js';
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
