import { z } from 'zod';
import { readFile, writeFile, access } from 'node:fs/promises';

interface FileUpdateResult {
  message: string;
  diff: string;
}

function computeDiff(oldContent: string, newContent: string): string {
  if (oldContent === newContent) return '';

  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const result: string[] = [];

  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : undefined;
    const newLine = i < newLines.length ? newLines[i] : undefined;

    if (oldLine === newLine) continue;
    if (oldLine !== undefined && newLine !== undefined) {
      result.push(`-${oldLine}`);
      result.push(`+${newLine}`);
    } else if (oldLine !== undefined) {
      result.push(`-${oldLine}`);
    } else if (newLine !== undefined) {
      result.push(`+${newLine}`);
    }
  }

  return result.join('\n');
}

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
    execute: async ({ filePath, content }: z.infer<typeof parameters>): Promise<FileUpdateResult> => {
      await access(filePath);
      const oldContent = await readFile(filePath, 'utf-8');
      await writeFile(filePath, content, 'utf-8');
      return {
        message: `Updated ${content.length} bytes in ${filePath}`,
        diff: computeDiff(oldContent, content),
      };
    },
  },
  execute: async (params: { filePath: string; content: string }): Promise<FileUpdateResult> => {
    await access(params.filePath);
    const oldContent = await readFile(params.filePath, 'utf-8');
    await writeFile(params.filePath, params.content, 'utf-8');
    return {
      message: `Updated ${params.content.length} bytes in ${params.filePath}`,
      diff: computeDiff(oldContent, params.content),
    };
  },
};
