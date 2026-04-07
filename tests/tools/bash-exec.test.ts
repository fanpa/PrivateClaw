import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { bashExecTool } from '../../src/tools/bash-exec.js';
import { assertToolStructure } from './helpers.js';

describe('bashExecTool', () => {
  it('has correct name and description', () => {
    expect(bashExecTool.name).toBe('bash_exec');
    expect(bashExecTool.description).toBeDefined();
  });

  it('executes a simple command', async () => {
    const result = await bashExecTool.execute({ command: 'echo hello' });
    expect(result.stdout.trim()).toBe('hello');
    expect(result.exitCode).toBe(0);
  });

  it('captures stderr', async () => {
    const result = await bashExecTool.execute({ command: 'echo error >&2' });
    expect(result.stderr.trim()).toBe('error');
  });

  it('returns non-zero exit code on failure', async () => {
    const result = await bashExecTool.execute({ command: 'exit 1' });
    expect(result.exitCode).toBe(1);
  });

  it('respects timeout', async () => {
    const result = await bashExecTool.execute({
      command: 'sleep 10',
      timeout: 500,
    });
    expect(result.exitCode).not.toBe(0);
  });

  describe('tool object (AI SDK path)', () => {
    it('has inputSchema defined on tool object', () => {
      expect(bashExecTool.tool.inputSchema).toBeDefined();
    });

    it('inputSchema parses valid input', () => {
      const schema = bashExecTool.tool.inputSchema as import('zod').ZodSchema;
      const result = schema.parse({ command: 'echo hi' });
      expect(result.command).toBe('echo hi');
    });

    it('inputSchema allows optional timeout', () => {
      const schema = bashExecTool.tool.inputSchema as import('zod').ZodSchema;
      const withTimeout = schema.parse({ command: 'echo hi', timeout: 5000 });
      expect(withTimeout.timeout).toBe(5000);
      const withoutTimeout = schema.parse({ command: 'echo hi' });
      expect(withoutTimeout.timeout).toBeUndefined();
    });

    it('inputSchema rejects missing command', () => {
      const schema = bashExecTool.tool.inputSchema as import('zod').ZodSchema;
      expect(() => schema.parse({})).toThrow();
    });

    it('tool.execute works via inputSchema parse (simulates AI SDK call)', async () => {
      const schema = bashExecTool.tool.inputSchema as import('zod').ZodSchema;
      const parsedInput = schema.parse({ command: 'echo sdk' });
      const result = await bashExecTool.tool.execute(parsedInput, { toolCallId: 'test', messages: [] } as never);
      expect(result.stdout.trim()).toBe('sdk');
      expect(result.exitCode).toBe(0);
    });
  });
});

describe('bashExecTool inputSchema and AI SDK path', () => {
  it('has valid tool structure with inputSchema', () => {
    assertToolStructure(bashExecTool);
  });

  it('inputSchema accepts valid input with command only', () => {
    const schema = bashExecTool.tool.inputSchema as z.ZodSchema;
    const result = schema.parse({ command: 'echo hi' });
    expect(result.command).toBe('echo hi');
    expect(result.timeout).toBeUndefined();
  });

  it('inputSchema accepts optional timeout', () => {
    const schema = bashExecTool.tool.inputSchema as z.ZodSchema;
    const result = schema.parse({ command: 'echo hi', timeout: 5000 });
    expect(result.timeout).toBe(5000);
  });

  it('inputSchema rejects missing command', () => {
    const schema = bashExecTool.tool.inputSchema as z.ZodSchema;
    expect(() => schema.parse({})).toThrow();
  });

  it('tool.execute works when called via inputSchema parse (AI SDK path)', async () => {
    const schema = bashExecTool.tool.inputSchema as z.ZodSchema;
    const parsedInput = schema.parse({ command: 'echo sdk-path' });
    const result = await bashExecTool.tool.execute(parsedInput, { toolCallId: 'test', messages: [] });
    expect(result.stdout.trim()).toBe('sdk-path');
    expect(result.exitCode).toBe(0);
  });
});
