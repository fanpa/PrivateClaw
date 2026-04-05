import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fileReadTool } from '../../src/tools/file-read.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

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
});
