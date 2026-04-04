import { streamText } from 'ai';
import type { CoreMessage, LanguageModelV1 } from 'ai';
import { getModel } from '../provider/registry.js';
import { getBuiltinTools } from '../tools/registry.js';
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_MAX_STEPS } from './types.js';

export interface RunAgentTurnOptions {
  messages: CoreMessage[];
  systemPrompt?: string;
  maxSteps?: number;
  model?: LanguageModelV1;
  onChunk?: (chunk: string) => void;
  fetch?: typeof globalThis.fetch;
}

export interface AgentTurnResult {
  text: string;
  responseMessages: CoreMessage[];
}

export async function runAgentTurn(options: RunAgentTurnOptions): Promise<AgentTurnResult> {
  const {
    messages,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    maxSteps = DEFAULT_MAX_STEPS,
    model,
    onChunk,
  } = options;

  const result = streamText({
    model: model ?? getModel(),
    system: systemPrompt,
    messages,
    tools: getBuiltinTools(),
    maxSteps,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });

  let fullText = '';
  for await (const chunk of result.textStream) {
    fullText += chunk;
    onChunk?.(chunk);
  }

  const response = await result.response;

  return {
    text: fullText,
    responseMessages: response.messages as CoreMessage[],
  };
}
