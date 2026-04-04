import { streamText } from 'ai';
import type { CoreMessage, LanguageModelV1 } from 'ai';
import { getModel, getRestrictedFetch } from '../provider/registry.js';
import { getBuiltinTools } from '../tools/registry.js';
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_MAX_STEPS } from './types.js';

export interface RunAgentTurnOptions {
  messages: CoreMessage[];
  systemPrompt?: string;
  maxSteps?: number;
  model?: LanguageModelV1;
  onChunk?: (chunk: string) => void;
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
  onToolResult?: (toolName: string, result: unknown) => void;
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
    tools: getBuiltinTools(getRestrictedFetch()),
    maxSteps,
  });

  let fullText = '';
  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta':
        fullText += part.textDelta;
        onChunk?.(part.textDelta);
        break;
      case 'tool-call': {
        const callPart = part as unknown as { toolName: string; input: Record<string, unknown> };
        options.onToolCall?.(callPart.toolName, callPart.input);
        break;
      }
      case 'tool-result': {
        const resultPart = part as unknown as { toolName: string; output: unknown };
        options.onToolResult?.(resultPart.toolName, resultPart.output);
        break;
      }
    }
  }

  const response = await result.response;

  return {
    text: fullText,
    responseMessages: response.messages as CoreMessage[],
  };
}
