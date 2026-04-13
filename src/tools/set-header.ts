import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

interface SetHeaderResult {
  success?: boolean;
  domain?: string;
  error?: string;
}

const parameters = z.object({
  domain: z.string().describe('The domain to set headers for, e.g. "api.company.com"'),
  headers: z.record(z.string()).describe('Headers to set as key-value pairs, e.g. {"Authorization": "Bearer token", "User-Agent": "CustomAgent/1.0"}'),
});

function doSetHeader(
  domain: string,
  headers: Record<string, string>,
  configPath: string,
): SetHeaderResult {
  if (!existsSync(configPath)) {
    return { error: 'Config file not found.' };
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);

    if (!config.security) config.security = {};
    if (!config.security.defaultHeaders) config.security.defaultHeaders = {};
    if (!config.security.defaultHeaders[domain]) config.security.defaultHeaders[domain] = {};

    // Merge headers (new values override existing)
    for (const [key, value] of Object.entries(headers)) {
      config.security.defaultHeaders[domain][key] = value;
    }

    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    return { success: true, domain };
  } catch (err) {
    return { error: `Failed to set headers: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export function createSetHeaderTool(configPath: string) {
  return {
    name: 'set_header' as const,
    description: 'Set default HTTP headers for a domain in the config. Headers are used by api_call and web_fetch.',
    tool: {
      description: 'Set default HTTP headers for a domain. These headers are automatically injected into api_call and web_fetch requests to that domain. Use this to set Authorization tokens, User-Agent, Cookie, or any custom headers. Call reload_config after to apply changes.',
      inputSchema: parameters,
      execute: async ({ domain, headers }: z.infer<typeof parameters>): Promise<SetHeaderResult> => {
        return doSetHeader(domain, headers, configPath);
      },
    },
    execute: async (params: { domain: string; headers: Record<string, string> }): Promise<SetHeaderResult> => {
      return doSetHeader(params.domain, params.headers, configPath);
    },
  };
}
