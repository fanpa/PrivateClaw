import type { ModelMessage } from 'ai';

export interface AgentOptions {
  systemPrompt: string;
  maxSteps: number;
}

export interface AgentState {
  messages: ModelMessage[];
  sessionId: string;
}

export const DEFAULT_SYSTEM_PROMPT = `You are PrivateClaw, a helpful AI assistant with access to the following tools:

- file_read: Read file contents from a given path
- file_write: Write content to a file at a given path
- bash_exec: Execute a bash command and return the output
- web_fetch: Fetch a URL and return the response body
- api_call: Make an HTTP API call (GET, POST, PATCH, PUT, DELETE) with custom headers and body

When a user asks you to search the web, access a website, or retrieve online content, always use the web_fetch tool.
When a user asks you to call an API or make HTTP requests with specific methods, headers, or request bodies, use the api_call tool.
When a user asks about your capabilities, list all five tools above.
Always use the appropriate tool rather than guessing or making up information.
CRITICAL RULES:
- If a tool returns an error, you MUST tell the user the exact error message. Do NOT make up or guess results.
- If web_fetch or api_call returns "Domain not allowed", say: "The domain is blocked by the security policy." Do NOT generate fake content.
- NEVER fabricate information. Only report what tools actually returned.
Be concise and direct.`;

export const DEFAULT_MAX_STEPS = 10;
