import { z } from 'zod';

interface ApiCallResult {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
  error?: string;
}

const parameters = z.object({
  url: z.string().describe('The URL to call'),
  method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']).describe('HTTP method'),
  headers: z.record(z.string()).optional().describe('HTTP headers as key-value pairs'),
  body: z.string().optional().describe('Request body (for POST, PATCH, PUT)'),
});

async function doApiCall(
  fetchFn: typeof globalThis.fetch,
  params: z.infer<typeof parameters>,
): Promise<ApiCallResult> {
  try {
    const response = await fetchFn(params.url, {
      method: params.method,
      headers: params.headers,
      body: params.body,
    });

    const body = await response.text();
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return { status: response.status, body, headers: responseHeaders };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      error: `TOOL FAILED: ${message}. You MUST report this error to the user. Do NOT make up or guess the content.`,
    };
  }
}

export function createApiCallTool(fetchFn: typeof globalThis.fetch) {
  return {
    name: 'api_call' as const,
    description: 'Make an HTTP API call with specified method, headers, and body. Supports GET, POST, PATCH, PUT, DELETE. Respects domain whitelist.',
    tool: {
      description: 'Make an HTTP API call with specified method, headers, and body. Supports GET, POST, PATCH, PUT, DELETE. Respects domain whitelist.',
      parameters,
      execute: async (input: z.infer<typeof parameters>): Promise<ApiCallResult> => {
        return doApiCall(fetchFn, input);
      },
    },
    execute: async (params: z.infer<typeof parameters>): Promise<ApiCallResult> => {
      return doApiCall(fetchFn, params);
    },
  };
}
