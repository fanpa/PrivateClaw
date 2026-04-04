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
    return { error: err instanceof Error ? err.message : String(err) };
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
      parameters,
      execute: async ({ url }: z.infer<typeof parameters>): Promise<WebFetchResult> => {
        return doFetch(fetchFn, url);
      },
    },
    execute: async (params: { url: string }): Promise<WebFetchResult> => {
      return doFetch(fetchFn, params.url);
    },
  };
}
