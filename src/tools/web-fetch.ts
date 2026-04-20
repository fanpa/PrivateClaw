import { z } from 'zod';
import { defineTool } from './define-tool.js';

interface WebFetchResult {
  status?: number;
  body?: string;
  error?: string;
}

async function doFetch(fetchFn: typeof globalThis.fetch, url: string): Promise<WebFetchResult> {
  try {
    const response = await fetchFn(url);
    const body = await response.text();
    return { status: response.status, body };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const cause = err instanceof Error && err.cause instanceof Error ? ` (cause: ${err.cause.message})` : '';
    return {
      error: `TOOL FAILED: ${message}${cause}. You MUST report this error to the user. Do NOT make up or guess the content.`,
    };
  }
}

const parameters = z.object({
  url: z.string().describe('The URL to fetch'),
});

export function createWebFetchTool(fetchFn: typeof globalThis.fetch) {
  return defineTool({
    name: 'web_fetch' as const,
    description: 'Fetch a URL and return the response body. Respects domain whitelist.',
    parameters,
    execute: async ({ url }): Promise<WebFetchResult> => doFetch(fetchFn, url),
  });
}
