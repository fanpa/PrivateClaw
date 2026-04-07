import { z } from 'zod';
import { zodSchema } from 'ai';
import { readFile } from 'node:fs/promises';

const parameters = z.object({
  filePath: z.string().describe('Absolute path to the file to read'),
});

export const fileReadTool = {
  name: 'file_read' as const,
  description: 'Read the contents of a file at the given path.',
  tool: {
    description: 'Read the contents of a file at the given path.',
    inputSchema: zodSchema(parameters),
    execute: async ({ filePath }: z.infer<typeof parameters>) => {
      return await readFile(filePath, 'utf-8');
    },
  },
  execute: async (params: { filePath: string }) => {
    return await readFile(params.filePath, 'utf-8');
  },
};
