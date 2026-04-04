import { tool } from 'ai';
import { z } from 'zod';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export const fileWriteTool = {
  name: 'file_write' as const,
  description: 'Write content to a file at the given path. Creates parent directories if needed.',
  tool: tool({
    description: 'Write content to a file at the given path. Creates parent directories if needed.',
    parameters: z.object({
      filePath: z.string().describe('Absolute path to the file to write'),
      content: z.string().describe('Content to write to the file'),
    }),
    execute: async ({ filePath, content }) => {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, 'utf-8');
      return `Written ${content.length} bytes to ${filePath}`;
    },
  }),
  execute: async (params: { filePath: string; content: string }) => {
    await mkdir(dirname(params.filePath), { recursive: true });
    await writeFile(params.filePath, params.content, 'utf-8');
    return `Written ${params.content.length} bytes to ${params.filePath}`;
  },
};
