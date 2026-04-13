import { z } from 'zod';
import { writeFile, access } from 'node:fs/promises';

const parameters = z.object({
  filePath: z.string().describe('Absolute path to the existing file to update'),
  content: z.string().describe('New content to overwrite the file with'),
});

export const fileUpdateTool = {
  name: 'file_update' as const,
  description:
    'Overwrite an existing file with new content. Fails if the file does not exist. Use file_write to create new files.',
  tool: {
    description:
      'Overwrite an existing file with new content. Fails if the file does not exist. Use file_write to create new files.',
    inputSchema: parameters,
    execute: async ({ filePath, content }: z.infer<typeof parameters>) => {
      await access(filePath);
      await writeFile(filePath, content, 'utf-8');
      return `Updated ${content.length} bytes in ${filePath}`;
    },
  },
  execute: async (params: { filePath: string; content: string }) => {
    await access(params.filePath);
    await writeFile(params.filePath, params.content, 'utf-8');
    return `Updated ${params.content.length} bytes in ${params.filePath}`;
  },
};
