import { readFile } from 'fs/promises';
import { basename, extname } from 'path';
import { z } from 'zod';
import { defineTool } from './define-tool.js';

interface ApiCallResult {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
  error?: string;
}

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.xml': 'application/xml',
  '.zip': 'application/zip',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
};

function inferMimeType(filePath: string): string {
  return MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

const parameters = z.object({
  url: z.string().describe('The URL to call'),
  method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']).describe('HTTP method'),
  headers: z.record(z.string()).optional().describe('HTTP headers as key-value pairs'),
  body: z.string().optional().describe('Request body (for POST, PATCH, PUT)'),
  formData: z.object({
    fields: z.record(z.string()).optional()
      .describe('String fields to append to FormData (e.g. { "data": "{\"key\":\"value\"}" })'),
    files: z.array(z.object({
      fieldName: z.string().describe('Form field name (e.g. "files")'),
      filePath: z.string().describe('Absolute path to the file on disk'),
      fileName: z.string().optional().describe('Override filename sent to server'),
      mimeType: z.string().optional().describe('MIME type (e.g. "image/png"). Inferred if omitted.'),
    })).optional()
      .describe('Files to attach as multipart/form-data'),
  }).optional().describe('Send request as multipart/form-data. Takes precedence over body.'),
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

async function buildFormData(formDataParams: NonNullable<z.infer<typeof parameters>['formData']>): Promise<FormData> {
  const form = new FormData();

  for (const [key, value] of Object.entries(formDataParams.fields ?? {})) {
    form.append(key, value);
  }

  for (const file of formDataParams.files ?? []) {
    const data = await readFile(file.filePath);
    const mimeType = file.mimeType ?? inferMimeType(file.filePath);
    const blob = new Blob([data], { type: mimeType });
    const name = file.fileName ?? basename(file.filePath);
    form.append(file.fieldName, blob, name);
  }

  return form;
}

async function doApiCall(
  fetchFn: typeof globalThis.fetch,
  defaultHeaders: Record<string, Record<string, string>>,
  params: z.infer<typeof parameters>,
): Promise<ApiCallResult> {
  try {
    const mergedHeaders = resolveHeaders(params.url, defaultHeaders, params.headers);

    let requestBody: string | FormData | undefined;
    if (params.formData) {
      requestBody = await buildFormData(params.formData);
    } else {
      requestBody = params.body;
    }

    const response = await fetchFn(params.url, {
      method: params.method,
      headers: Object.keys(mergedHeaders).length > 0 ? mergedHeaders : undefined,
      body: requestBody,
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
  return defineTool({
    name: 'api_call' as const,
    description: 'Make an HTTP API call with specified method, headers, and body. Supports GET, POST, PATCH, PUT, DELETE. Respects domain whitelist.',
    parameters,
    execute: async (input): Promise<ApiCallResult> => doApiCall(fetchFn, defaultHeaders, input),
  });
}
