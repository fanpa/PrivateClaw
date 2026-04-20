import { z } from 'zod';
import { spawn } from 'node:child_process';
import { isCommandAllowed } from '../security/command-guard.js';
import { defineTool } from './define-tool.js';

interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 30000;
const KILL_GRACE_MS = 2000;

async function executeShell(
  command: string,
  allowedCommands: string[],
  timeout?: number,
): Promise<ShellResult> {
  const check = isCommandAllowed(command, allowedCommands);
  if (!check.allowed) {
    return {
      stdout: '',
      stderr: '',
      exitCode: 1,
      error: `Command "${check.blockedCommand}" is not in the allowed commands list. Allowed: ${allowedCommands.join(', ')}`,
    };
  }

  const isWin = process.platform === 'win32';
  const shellCmd = isWin ? 'powershell.exe' : '/bin/sh';
  const shellArgs = isWin ? ['-NoProfile', '-Command', command] : ['-c', command];
  const timeoutMs = timeout ?? DEFAULT_TIMEOUT_MS;

  return new Promise<ShellResult>((resolve) => {
    const child = spawn(shellCmd, shellArgs, { stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const killTimer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      const hardKill = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS);
      hardKill.unref();
    }, timeoutMs);
    killTimer.unref();

    child.stdout?.setEncoding('utf-8');
    child.stderr?.setEncoding('utf-8');
    child.stdout?.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr?.on('data', (chunk: string) => { stderr += chunk; });

    const finish = (result: ShellResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      resolve(result);
    };

    child.on('error', (err) => {
      finish({ stdout, stderr, exitCode: 1, error: err.message });
    });

    child.on('close', (code, signal) => {
      if (timedOut) {
        finish({
          stdout,
          stderr,
          exitCode: code ?? 1,
          error: `Command timed out after ${timeoutMs}ms`,
        });
        return;
      }
      finish({ stdout, stderr, exitCode: code ?? (signal ? 1 : 0) });
    });
  });
}

const parameters = z.object({
  command: z.string().describe('The shell command to execute'),
  timeout: z.number().optional().describe('Timeout in milliseconds (default: 30000)'),
});

export function createShellExecTool(allowedCommands: string[] = []) {
  return defineTool({
    name: 'shell_exec' as const,
    description: 'Execute a shell command and return stdout, stderr, and exit code.',
    parameters,
    execute: async ({ command, timeout }): Promise<ShellResult> =>
      executeShell(command, allowedCommands, timeout),
  });
}

export const shellExecTool = createShellExecTool();
