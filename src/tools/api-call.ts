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

function resolveHeaders(
  url: string,
  defaultHeaders: Record<string, Record<string, string>>,
  requestHeaders?: Record<string, string>,
): Record<string, string> {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return requestHeaders ?? {};
  }

  const defaults = defaultHeaders[hostname] ?? {};
  return { ...defaults, ...requestHeaders };
}

async function doApiCall(
  fetchFn: typeof globalThis.fetch,
  defaultHeaders: Record<string, Record<string, string>>,
  params: z.infer<typeof parameters>,
): Promise<ApiCallResult> {
  try {
    const mergedHeaders = resolveHeaders(params.url, defaultHeaders, params.headers);
    const response = await fetchFn(params.url, {
      method: params.method,
      headers: Object.keys(mergedHeaders).length > 0 ? mergedHeaders : undefined,
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
    const cause = err instanceof Error && err.cause instanceof Error ? ` (cause: ${err.cause.message})` : '';
    return {
      error: `TOOL FAILED: ${message}${cause}. You MUST report this error to the user. Do NOT make up or guess the content.`,
    };
  }
}

export function createApiCallTool(
  fetchFn: typeof globalThis.fetch,
  defaultHeaders: Record<string, Record<string, string>> = {},
) {
  return {
    name: 'api_call' as const,
    description: 'Make an HTTP API call with specified method, headers, and body. Supports GET, POST, PATCH, PUT, DELETE. Respects domain whitelist.',
    tool: {
      description: 'Make an HTTP API call with specified method, headers, and body. Supports GET, POST, PATCH, PUT, DELETE. Respects domain whitelist.',
      parameters,
      execute: async (input: z.infer<typeof parameters>): Promise<ApiCallResult> => {
        return doApiCall(fetchFn, defaultHeaders, input);
      },
    },
    execute: async (params: z.infer<typeof parameters>): Promise<ApiCallResult> => {
      return doApiCall(fetchFn, defaultHeaders, params);
    },
  };
}
