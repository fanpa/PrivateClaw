import type { ModelMessage } from 'ai';
import type { SkillConfig } from '../skills/types.js';
import { listSkills } from '../skills/loader.js';

export interface AgentOptions {
  systemPrompt: string;
  maxSteps: number;
}

export interface AgentState {
  messages: ModelMessage[];
  sessionId: string;
}

export function buildSystemPrompt(skills: SkillConfig[] = []): string {
  let prompt = `You are PrivateClaw, a helpful AI assistant with access to the following tools:

- file_read: Read file contents from a given path
- file_write: Write content to a file at a given path
- bash_exec: Execute a bash command and return the output
- web_fetch: Fetch a URL and return the response body
- api_call: Make an HTTP API call (GET, POST, PATCH, PUT, DELETE) with custom headers and body
- create_skill: Create a new reusable skill by writing a skill.md file and registering it in the config`;

  if (skills.length > 0) {
    prompt += `\n- use_skill: Load a skill document to follow its workflow instructions`;
    prompt += `\n\nAvailable skills:\n${listSkills(skills)}`;
    prompt += `\nWhen a task matches a skill description, use the use_skill tool to load it, then follow its workflow instructions step by step.`;
  }

  prompt += `\nWhen a user asks to create a new skill or workflow, use create_skill. Have a conversation to understand the workflow steps, then generate a complete skill.md document.`;

  prompt += `

When a user asks you to search the web, access a website, or retrieve online content, always use the web_fetch tool.
When a user asks you to call an API or make HTTP requests with specific methods, headers, or request bodies, use the api_call tool.
When a user asks about your capabilities, list all tools above.
Always use the appropriate tool rather than guessing or making up information.
CRITICAL RULES:
- If a tool returns an error, you MUST tell the user the exact error message. Do NOT make up or guess results.
- If web_fetch or api_call returns "Domain not allowed", say: "The domain is blocked by the security policy." Do NOT generate fake content.
- NEVER fabricate information. Only report what tools actually returned.
Be concise and direct.`;

  return prompt;
}

export const DEFAULT_SYSTEM_PROMPT = buildSystemPrompt();

export const DEFAULT_MAX_STEPS = 10;

export const REFLECTION_PROMPT = `Review your previous response for accuracy and quality:
- Is the information correct and based on actual tool results?
- Did you fabricate any information not returned by tools?
- Is the response clear and well-structured?
- Did you miss anything the user asked for?

If your response was accurate and complete, reply with exactly: [LGTM]
If corrections are needed, provide the corrected response.`;
