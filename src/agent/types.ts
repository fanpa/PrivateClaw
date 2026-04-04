import type { ModelMessage } from 'ai';

export interface AgentOptions {
  systemPrompt: string;
  maxSteps: number;
}

export interface AgentState {
  messages: ModelMessage[];
  sessionId: string;
}

export const DEFAULT_SYSTEM_PROMPT = `You are PrivateClaw, a helpful AI assistant with access to tools.
You can read files, write files, and execute bash commands.
Always explain what you are doing before using a tool.
Be concise and direct.`;

export const DEFAULT_MAX_STEPS = 10;
