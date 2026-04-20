import { z } from 'zod';
import { executeAuth } from '../cli/auth.js';
import { defineTool } from './define-tool.js';

interface BrowserAuthResult {
  domain?: string;
  cookies?: Array<{ name: string; value: string }>;
  message?: string;
  error?: string;
}

const parameters = z.object({
  url: z.string().describe('The login page URL to open in the browser, e.g. "https://jira.company.com/login"'),
  extraHeaders: z.record(z.string()).optional().describe('Extra HTTP headers to inject into the browser, e.g. {"User-Agent": "CustomBot/1.0"}'),
});

export function createBrowserAuthTool() {
  return defineTool({
    name: 'browser_auth' as const,
    description: 'Open a browser for the user to log in, then capture and return cookies.',
    toolDescription: 'Open Chrome/Edge browser to a login page. The user logs in manually, then cookies are captured and returned. Use set_header to save specific cookie values or tokens to config. Pass extraHeaders to inject custom HTTP headers into every browser request (e.g. {"User-Agent": "CustomBot/1.0"}).',
    parameters,
    execute: async ({ url, extraHeaders }): Promise<BrowserAuthResult> => {
      try {
        const result = await executeAuth({ url, extraHeaders });
        return {
          domain: result.domain,
          cookies: result.cookies.map((c) => ({ name: c.name, value: c.value })),
          message: `Captured ${result.cookies.length} cookies for ${result.domain}. Review the cookies and use set_header to save the needed values.`,
        };
      } catch (err) {
        return { error: `Browser auth failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  });
}
