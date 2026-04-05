import { fileReadTool } from './file-read.js';
import { fileWriteTool } from './file-write.js';
import { bashExecTool } from './bash-exec.js';
import { createWebFetchTool } from './web-fetch.js';
import { createApiCallTool } from './api-call.js';

export interface BuiltinToolsOptions {
  fetchFn?: typeof globalThis.fetch;
  defaultHeaders?: Record<string, Record<string, string>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getBuiltinTools(options: BuiltinToolsOptions = {}): Record<string, any> {
  const f = options.fetchFn ?? globalThis.fetch;
  const webFetch = createWebFetchTool(f);
  const apiCall = createApiCallTool(f, options.defaultHeaders ?? {});
  return {
    [fileReadTool.name]: fileReadTool.tool,
    [fileWriteTool.name]: fileWriteTool.tool,
    [bashExecTool.name]: bashExecTool.tool,
    [webFetch.name]: webFetch.tool,
    [apiCall.name]: apiCall.tool,
  };
}
