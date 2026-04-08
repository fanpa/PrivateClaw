import { z } from 'zod';
import { spawnSync } from 'node:child_process';

interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function executeShell(command: string, timeout?: number): ShellResult {
  const result = spawnSync(command, {
    encoding: 'utf-8',
    timeout: timeout ?? 30000,
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? 1,
  };
}

const parameters = z.object({
  command: z.string().describe('The shell command to execute'),
  timeout: z.number().optional().describe('Timeout in milliseconds (default: 30000)'),
});

export const shellExecTool = {
  name: 'shell_exec' as const,
  description: 'Execute a shell command and return stdout, stderr, and exit code.',
  tool: {
    description: 'Execute a shell command and return stdout, stderr, and exit code.',
    inputSchema: parameters,
    execute: async ({ command, timeout }: z.infer<typeof parameters>): Promise<ShellResult> => {
      return executeShell(command, timeout);
    },
  },
  execute: async (params: { command: string; timeout?: number }): Promise<ShellResult> => {
    return executeShell(params.command, params.timeout);
  },
};
