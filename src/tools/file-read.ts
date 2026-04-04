import { tool } from 'ai';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';

export const fileReadTool = {
  name: 'file_read' as const,
  description: 'Read the contents of a file at the given path.',
  tool: tool({
    description: 'Read the contents of a file at the given path.',
    parameters: z.object({
      filePath: z.string().describe('Absolute path to the file to read'),
    }),
    execute: async ({ filePath }) => {
      return await readFile(filePath, 'utf-8');
    },
  }),
  execute: async (params: { filePath: string }) => {
    return await readFile(params.filePath, 'utf-8');
  },
};
