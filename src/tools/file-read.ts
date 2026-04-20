import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { defineTool } from './define-tool.js';

const parameters = z.object({
  filePath: z.string().describe('Absolute path to the file to read'),
});

function isInsideExcluded(filePath: string, excludedDirs: string[]): boolean {
  const resolved = resolve(filePath);
  return excludedDirs.some((dir) => {
    const resolvedDir = resolve(dir);
    const rel = relative(resolvedDir, resolved);
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  });
}

export function createFileReadTool(excludedDirs: string[] = []) {
  return defineTool({
    name: 'file_read' as const,
    description: 'Read the contents of a file at the given path.',
    toolDescription:
      'Read the contents of a file at the given path. To load a skill, use the use_skill tool instead.',
    parameters,
    execute: async ({ filePath }): Promise<string | { error: string }> => {
      if (isInsideExcluded(filePath, excludedDirs)) {
        return { error: 'Access denied: skill files must be loaded via the use_skill tool, not file_read.' };
      }
      return await readFile(filePath, 'utf-8');
    },
  });
}

export const fileReadTool = createFileReadTool();
