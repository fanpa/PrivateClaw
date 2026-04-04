import { fileReadTool } from './file-read.js';
import { fileWriteTool } from './file-write.js';
import { bashExecTool } from './bash-exec.js';
import { createWebFetchTool } from './web-fetch.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getBuiltinTools(fetchFn?: typeof globalThis.fetch): Record<string, any> {
  const webFetch = createWebFetchTool(fetchFn ?? globalThis.fetch);
  return {
    [fileReadTool.name]: fileReadTool.tool,
    [fileWriteTool.name]: fileWriteTool.tool,
    [bashExecTool.name]: bashExecTool.tool,
    [webFetch.name]: webFetch.tool,
  };
}
