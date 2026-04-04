import { describe, it, expect } from 'vitest';
import { bashExecTool } from '../../src/tools/bash-exec.js';

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
});
