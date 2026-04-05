import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fileWriteTool } from '../../src/tools/file-write.js';
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
