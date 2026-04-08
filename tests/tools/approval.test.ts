import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { getBuiltinTools } from '../../src/tools/registry.js';

const TEST_DIR = join(import.meta.dirname, '__fixtures_approval__');

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('getBuiltinTools with onApproval', () => {
  it('does not execute tool when approval callback returns deny', async () => {
    const onApproval = vi.fn().mockResolvedValue('deny');
    const tools = getBuiltinTools({ onApproval });

    const filePath = join(TEST_DIR, 'secret.txt');
    writeFileSync(filePath, 'secret content');

    const result = await tools['file_read'].execute({ filePath }, {} as never);

    expect(onApproval).toHaveBeenCalledWith('file_read', { filePath });
    expect(result).toEqual({ error: 'Tool execution denied by user.' });
  });

  it('executes tool normally when approval callback returns allow_once', async () => {
    const onApproval = vi.fn().mockResolvedValue('allow_once');
    const tools = getBuiltinTools({ onApproval });

    const filePath = join(TEST_DIR, 'test.txt');
    writeFileSync(filePath, 'hello world');

    const result = await tools['file_read'].execute({ filePath }, {} as never);

    expect(onApproval).toHaveBeenCalledWith('file_read', { filePath });
    expect(result).toBe('hello world');
  });

  it('executes tool normally when approval callback returns allow_always', async () => {
    const onApproval = vi.fn().mockResolvedValue('allow_always');
    const tools = getBuiltinTools({ onApproval });

    const filePath = join(TEST_DIR, 'test.txt');
    writeFileSync(filePath, 'hello world');

    const result = await tools['file_read'].execute({ filePath }, {} as never);

    expect(onApproval).toHaveBeenCalledWith('file_read', { filePath });
    expect(result).toBe('hello world');
  });

  it('executes tool normally when no approval callback is provided', async () => {
    const tools = getBuiltinTools();

    const filePath = join(TEST_DIR, 'test.txt');
    writeFileSync(filePath, 'hello world');

    const result = await tools['file_read'].execute({ filePath }, {} as never);

    expect(result).toBe('hello world');
  });

  it('calls approval callback with the correct tool name and args', async () => {
    const onApproval = vi.fn().mockResolvedValue('deny');
    const tools = getBuiltinTools({ onApproval });

    const filePath = join(TEST_DIR, 'test.txt');
    writeFileSync(filePath, 'content');

    await tools['file_read'].execute({ filePath }, {} as never);

    expect(onApproval).toHaveBeenCalledTimes(1);
    expect(onApproval).toHaveBeenCalledWith('file_read', { filePath });
  });
});
