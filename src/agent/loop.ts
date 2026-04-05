import { streamText, stepCountIs } from 'ai';
import type { ModelMessage, LanguageModel } from 'ai';
import { getModel, getRestrictedFetch } from '../provider/registry.js';
import { getBuiltinTools } from '../tools/registry.js';
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_MAX_STEPS } from './types.js';
import type { ApprovalDecision } from '../approval/types.js';

export interface RunAgentTurnOptions {
  messages: ModelMessage[];
  systemPrompt?: string;
  maxSteps?: number;
  model?: LanguageModel;
  defaultHeaders?: Record<string, Record<string, string>>;
  onChunk?: (chunk: string) => void;
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
  onToolResult?: (toolName: string, result: unknown) => void;
  onToolApproval?: (toolName: string, args: Record<string, unknown>) => Promise<ApprovalDecision>;
}

export interface AgentTurnResult {
  text: string;
  responseMessages: ModelMessage[];
  aborted?: boolean;
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
    tools: getBuiltinTools({ fetchFn: getRestrictedFetch(), defaultHeaders: options.defaultHeaders }),
    stopWhen: stepCountIs(maxSteps),
  });

  let fullText = '';
  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta':
        fullText += part.text;
        onChunk?.(part.text);
        break;
      case 'tool-call': {
        const callPart = part as unknown as { toolName: string; input: Record<string, unknown> };
        if (options.onToolApproval) {
          const decision = await options.onToolApproval(callPart.toolName, callPart.input);
          if (decision === 'deny') {
            return {
              text: fullText,
              responseMessages: [],
              aborted: true,
            };
          }
        }
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
    responseMessages: response.messages as ModelMessage[],
  };
}
