import { z } from 'zod';
import { executeAuth } from '../cli/auth.js';

interface BrowserAuthResult {
  domain?: string;
  cookieCount?: number;
  message?: string;
  error?: string;
}

const parameters = z.object({
  url: z.string().describe('The login page URL to open in the browser, e.g. "https://jira.company.com/login"'),
  extraHeaders: z.record(z.string()).optional().describe('Extra HTTP headers to inject into the browser, e.g. {"User-Agent": "CustomBot/1.0"}'),
});

export function createBrowserAuthTool(configPath: string) {
  return {
    name: 'browser_auth' as const,
    description: 'Open a browser for the user to log in, then capture cookies and save to config.',
    tool: {
      description: 'Open Chrome/Edge browser to a login page. The user logs in manually, then cookies are automatically captured and saved to config. After this, api_call requests to the domain will include the captured cookies. Call reload_config after to apply.',
      inputSchema: parameters,
      execute: async ({ url, extraHeaders }: z.infer<typeof parameters>): Promise<BrowserAuthResult> => {
        try {
          const result = await executeAuth({
            url,
            configPath,
            extraHeaders,
          });
          return {
            domain: result.domain,
            cookieCount: result.cookieCount,
            message: `Captured ${result.cookieCount} cookies for ${result.domain}. Call reload_config to apply.`,
          };
        } catch (err) {
          return { error: `Browser auth failed: ${err instanceof Error ? err.message : String(err)}` };
        }
      },
    },
    execute: async (params: { url: string; extraHeaders?: Record<string, string> }): Promise<BrowserAuthResult> => {
      try {
        const result = await executeAuth({
          url: params.url,
          configPath,
          extraHeaders: params.extraHeaders,
        });
        return {
          domain: result.domain,
          cookieCount: result.cookieCount,
          message: `Captured ${result.cookieCount} cookies for ${result.domain}. Call reload_config to apply.`,
        };
      } catch (err) {
        return { error: `Browser auth failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };
}
