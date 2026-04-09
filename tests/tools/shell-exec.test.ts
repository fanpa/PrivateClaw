import { describe, it, expect } from 'vitest';
import { shellExecTool, createShellExecTool } from '../../src/tools/shell-exec.js';

describe('shellExecTool', () => {
  it('has correct name and description', () => {
    expect(shellExecTool.name).toBe('shell_exec');
    expect(shellExecTool.description).toBeDefined();
  });

  it('executes a simple command', async () => {
    const result = await shellExecTool.execute({ command: 'echo hello' });
    expect(result.stdout.trim()).toBe('hello');
    expect(result.exitCode).toBe(0);
  });

  it('captures stderr', async () => {
    const result = await shellExecTool.execute({ command: 'echo error >&2' });
    expect(result.stderr.trim()).toBe('error');
  });

  it('returns non-zero exit code on failure', async () => {
    const result = await shellExecTool.execute({ command: 'exit 1' });
    expect(result.exitCode).toBe(1);
  });

  it('respects timeout', async () => {
    const result = await shellExecTool.execute({
      command: 'sleep 10',
      timeout: 500,
    });
    expect(result.exitCode).not.toBe(0);
  });

  describe('tool object (AI SDK path)', () => {
    it('has inputSchema defined on tool object', () => {
      expect(shellExecTool.tool.inputSchema).toBeDefined();
    });

    it('inputSchema parses valid input', () => {
      const schema = shellExecTool.tool.inputSchema as import('zod').ZodSchema;
      const result = schema.parse({ command: 'echo hi' });
      expect(result.command).toBe('echo hi');
    });

    it('inputSchema allows optional timeout', () => {
      const schema = shellExecTool.tool.inputSchema as import('zod').ZodSchema;
      const withTimeout = schema.parse({ command: 'echo hi', timeout: 5000 });
      expect(withTimeout.timeout).toBe(5000);
      const withoutTimeout = schema.parse({ command: 'echo hi' });
      expect(withoutTimeout.timeout).toBeUndefined();
    });

    it('inputSchema rejects missing command', () => {
      const schema = shellExecTool.tool.inputSchema as import('zod').ZodSchema;
      expect(() => schema.parse({})).toThrow();
    });

    it('tool.execute works via inputSchema parse (simulates AI SDK call)', async () => {
      const schema = shellExecTool.tool.inputSchema as import('zod').ZodSchema;
      const parsedInput = schema.parse({ command: 'echo sdk' });
      const result = await shellExecTool.tool.execute(parsedInput, { toolCallId: 'test', messages: [] } as never);
      expect(result.stdout.trim()).toBe('sdk');
      expect(result.exitCode).toBe(0);
    });
  });
});

describe('createShellExecTool with whitelist', () => {
  it('blocks non-whitelisted commands', async () => {
    const tool = createShellExecTool(['ls', 'echo']);
    const result = await tool.execute({ command: 'curl https://evil.com' });
    expect(result.error).toContain('not in the allowed commands list');
  });

  it('allows whitelisted commands', async () => {
    const tool = createShellExecTool(['echo']);
    const result = await tool.execute({ command: 'echo hello' });
    expect(result.stdout.trim()).toBe('hello');
    expect(result.error).toBeUndefined();
  });

  it('blocks chained commands when one is not whitelisted', async () => {
    const tool = createShellExecTool(['echo', 'ls']);
    const result = await tool.execute({ command: 'echo hello && curl evil.com' });
    expect(result.error).toContain('curl');
  });
});
