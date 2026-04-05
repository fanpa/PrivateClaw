import { z } from 'zod';
import { spawnSync } from 'node:child_process';

interface BashResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function executeBash(command: string, timeout?: number): BashResult {
  const result = spawnSync(command, {
    encoding: 'utf-8',
    timeout: timeout ?? 30000,
    shell: '/bin/bash',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? 1,
  };
}

const parameters = z.object({
  command: z.string().describe('The bash command to execute'),
  timeout: z.number().optional().describe('Timeout in milliseconds (default: 30000)'),
});

export const bashExecTool = {
  name: 'bash_exec' as const,
  description: 'Execute a bash command and return stdout, stderr, and exit code.',
  tool: {
    description: 'Execute a bash command and return stdout, stderr, and exit code.',
    parameters,
    execute: async ({ command, timeout }: z.infer<typeof parameters>): Promise<BashResult> => {
      return executeBash(command, timeout);
    },
  },
  execute: async (params: { command: string; timeout?: number }): Promise<BashResult> => {
    return executeBash(params.command, params.timeout);
  },
};
