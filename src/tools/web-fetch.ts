import { z } from 'zod';

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
  return {
    name: 'web_fetch' as const,
    description: 'Fetch a URL and return the response body. Respects domain whitelist.',
    tool: {
      description: 'Fetch a URL and return the response body. Respects domain whitelist.',
      inputSchema: parameters,
      execute: async ({ url }: z.infer<typeof parameters>): Promise<WebFetchResult> => {
        return doFetch(fetchFn, url);
      },
    },
    execute: async (params: { url: string }): Promise<WebFetchResult> => {
      return doFetch(fetchFn, params.url);
    },
  };
}
