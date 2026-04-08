import { streamText, generateText, stepCountIs } from 'ai';
import type { ModelMessage, LanguageModel } from 'ai';
import { getModel, getRestrictedFetch } from '../provider/registry.js';
import { getBuiltinTools } from '../tools/registry.js';
import { buildSystemPrompt, DEFAULT_MAX_STEPS, REFLECTION_PROMPT } from './types.js';
import type { ApprovalDecision } from '../approval/types.js';
import type { SkillConfig } from '../skills/types.js';

export interface RunAgentTurnOptions {
  messages: ModelMessage[];
  systemPrompt?: string;
  maxSteps?: number;
  model?: LanguageModel;
  temperature?: number;
  reflectionLoops?: number;
  defaultHeaders?: Record<string, Record<string, string>>;
  skills?: SkillConfig[];
  skillsDir?: string;
  onChunk?: (chunk: string) => void;
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
  onToolResult?: (toolName: string, result: unknown) => void;
  onToolApproval?: (toolName: string, args: unknown) => Promise<ApprovalDecision>;
  onReflecting?: (loop: number) => void;
  onReflectionDone?: (changed: boolean) => void;
}

export interface AgentTurnResult {
  text: string;
  responseMessages: ModelMessage[];
  aborted?: boolean;
}

async function reflectOnResponse(
  effectiveModel: LanguageModel,
  messages: ModelMessage[],
  response: string,
  temperature?: number,
): Promise<{ text: string; changed: boolean }> {
  const reflectionMessages: ModelMessage[] = [
    ...messages,
    { role: 'assistant', content: response },
    { role: 'user', content: REFLECTION_PROMPT },
  ];

  const result = await generateText({
    model: effectiveModel,
    messages: reflectionMessages,
    temperature,
  });

  const reflectionText = result.text.trim();

  if (reflectionText.includes('[LGTM]')) {
    return { text: response, changed: false };
  }

  return { text: reflectionText, changed: true };
}

export async function runAgentTurn(options: RunAgentTurnOptions): Promise<AgentTurnResult> {
  const {
    messages,
    systemPrompt,
    maxSteps = DEFAULT_MAX_STEPS,
    model,
    onChunk,
  } = options;

  const effectivePrompt = systemPrompt ?? buildSystemPrompt(options.skills);

  const result = streamText({
    model: model ?? getModel(),
    system: effectivePrompt,
    messages,
    temperature: options.temperature,
    tools: getBuiltinTools({
      fetchFn: getRestrictedFetch(),
      defaultHeaders: options.defaultHeaders,
      skills: options.skills,
      skillsDir: options.skillsDir,
      onApproval: options.onToolApproval,
    }),
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

  // Self-reflection loop
  const loops = options.reflectionLoops ?? 0;
  let finalText = fullText;

  if (loops > 0 && finalText.length > 0) {
    const effectiveModel = model ?? getModel();
    for (let i = 0; i < loops; i++) {
      options.onReflecting?.(i + 1);
      const reflection = await reflectOnResponse(
        effectiveModel,
        messages,
        finalText,
        options.temperature,
      );
      options.onReflectionDone?.(reflection.changed);
      if (!reflection.changed) break;
      finalText = reflection.text;
    }
  }

  return {
    text: finalText,
    responseMessages: response.messages as ModelMessage[],
  };
}
