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

  it('calls onBeforeToolExecute before approval and execution', async () => {
    const order: string[] = [];
    const onBeforeToolExecute = vi.fn().mockImplementation(async () => {
      order.push('before');
    });
    const onApproval = vi.fn().mockImplementation(async () => {
      order.push('approval');
      return 'allow_once' as const;
    });

    const tools = getBuiltinTools({ onApproval, onBeforeToolExecute });

    const filePath = join(TEST_DIR, 'test.txt');
    writeFileSync(filePath, 'hello');

    await tools['file_read'].execute({ filePath }, {} as never);

    expect(order).toEqual(['before', 'approval']);
    expect(onBeforeToolExecute).toHaveBeenCalledTimes(1);
  });

  it('calls onBeforeToolExecute even when onApproval is not set', async () => {
    const onBeforeToolExecute = vi.fn().mockResolvedValue(undefined);
    const tools = getBuiltinTools({ onBeforeToolExecute });

    const filePath = join(TEST_DIR, 'test.txt');
    writeFileSync(filePath, 'hello');

    const result = await tools['file_read'].execute({ filePath }, {} as never);

    expect(onBeforeToolExecute).toHaveBeenCalledTimes(1);
    expect(result).toBe('hello');
  });
});
