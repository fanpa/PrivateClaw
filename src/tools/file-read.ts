import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const parameters = z.object({
  filePath: z.string().describe('Absolute path to the file to read'),
});

function isExcluded(filePath: string, excludedDirs: string[]): boolean {
  const resolved = resolve(filePath);
  return excludedDirs.some((dir) => {
    const resolvedDir = resolve(dir);
    return resolved === resolvedDir || resolved.startsWith(resolvedDir + '/');
  });
}

export function createFileReadTool(excludedDirs: string[] = []) {
  return {
    name: 'file_read' as const,
    description: 'Read the contents of a file at the given path.',
    tool: {
      description: 'Read the contents of a file at the given path. To load a skill, use the use_skill tool instead.',
      inputSchema: parameters,
      execute: async ({ filePath }: z.infer<typeof parameters>): Promise<string | { error: string }> => {
        if (isExcluded(filePath, excludedDirs)) {
          return { error: 'Access denied: skill files must be loaded via the use_skill tool, not file_read.' };
        }
        return await readFile(filePath, 'utf-8');
      },
    },
    execute: async (params: { filePath: string }): Promise<string | { error: string }> => {
      if (isExcluded(params.filePath, excludedDirs)) {
        return { error: 'Access denied: skill files must be loaded via the use_skill tool, not file_read.' };
      }
      return await readFile(params.filePath, 'utf-8');
    },
  };
}

// Backward-compatible default export (no exclusions)
export const fileReadTool = createFileReadTool();
