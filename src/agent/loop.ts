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
  maxHistoryMessages?: number;
  model?: LanguageModel;
  temperature?: number;
  reflectionLoops?: number;
  defaultHeaders?: Record<string, Record<string, string>>;
  skills?: SkillConfig[];
  skillsDir?: string;
  allowedCommands?: string[];
  configPath?: string;
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

function applySliding(messages: ModelMessage[], max: number): ModelMessage[] {
  if (max <= 0 || messages.length <= max) return messages;
  return messages.slice(-max);
}

async function reflectOnResponse(
  effectiveModel: LanguageModel,
  messages: ModelMessage[],
  response: string,
  systemPrompt: string,
  temperature?: number,
): Promise<{ text: string; changed: boolean }> {
  const reflectionMessages: ModelMessage[] = [
    ...messages,
    { role: 'assistant', content: response },
    { role: 'user', content: REFLECTION_PROMPT },
  ];

  const result = await generateText({
    model: effectiveModel,
    system: systemPrompt,
    messages: reflectionMessages,
    temperature,
  });

  const reflectionText = result.text.trim();

  if (reflectionText.includes('[LGTM]')) {
    return { text: response, changed: false };
  }

  const CORRECTED_PREFIX = '[CORRECTED]';
  if (reflectionText.startsWith(CORRECTED_PREFIX)) {
    const corrected = reflectionText.slice(CORRECTED_PREFIX.length).trim();
    if (corrected.length > 0) {
      return { text: corrected, changed: true };
    }
  }

  // Safety net: LLM ignored the format — fall back to original to prevent
  // critique/instruction text from leaking to the user.
  return { text: response, changed: false };
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
  const effectiveModel = model ?? getModel();
  const loops = options.reflectionLoops ?? 0;
  const maxHistory = options.maxHistoryMessages ?? 0;

  // Build tools once; reused across steps so approval callbacks stay consistent.
  const toolSet = getBuiltinTools({
    fetchFn: getRestrictedFetch(),
    defaultHeaders: options.defaultHeaders,
    allowedCommands: options.allowedCommands,
    skills: options.skills,
    skillsDir: options.skillsDir,
    configPath: options.configPath,
    onApproval: options.onToolApproval,
  });

  let currentMessages: ModelMessage[] = applySliding([...messages], maxHistory);
  let fullText = '';
  let allResponseMessages: ModelMessage[] = [];

  // Each iteration opens a fresh HTTP connection (one streamText call = one request).
  // This prevents the TypeError: terminated that occurs when AI SDK's built-in
  // multi-step reuses a connection whose previous streaming response was not fully
  // drained before the next request was issued.
  for (let step = 0; step < maxSteps; step++) {
    const result = streamText({
      model: effectiveModel,
      system: effectivePrompt,
      messages: currentMessages,
      temperature: options.temperature,
      tools: toolSet,
      stopWhen: stepCountIs(1),
    });

    let stepHasToolCall = false;
    let stepHasText = false;

    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta':
          fullText += part.text;
          stepHasText = true;
          // When reflection is enabled, buffer text and hold streaming until after LGTM
          if (loops === 0) onChunk?.(part.text);
          break;
        case 'tool-call': {
          stepHasToolCall = true;
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

    // Await response after stream is fully consumed to ensure the underlying
    // HTTP connection is properly drained before any subsequent request.
    const response = await result.response;
    const stepMessages = response.messages as ModelMessage[];
    allResponseMessages = [...allResponseMessages, ...stepMessages];

    // Stop if the model produced text (final answer), or if no tool calls were made.
    if (stepHasText || !stepHasToolCall) break;

    // Tool calls occurred without a final answer — carry messages forward so the
    // next step sees the tool results.
    currentMessages = [...currentMessages, ...stepMessages];
  }

  // Self-reflection loop
  let finalText = fullText;

  if (loops > 0 && finalText.length > 0) {
    for (let i = 0; i < loops; i++) {
      options.onReflecting?.(i + 1);
      const reflection = await reflectOnResponse(
        effectiveModel,
        applySliding(messages, maxHistory),
        finalText,
        effectivePrompt,
        options.temperature,
      );
      options.onReflectionDone?.(reflection.changed);
      if (!reflection.changed) break;
      finalText = reflection.text;
    }
    // Emit the (possibly revised) text after reflection
    onChunk?.(finalText);
  }

  return {
    text: finalText,
    responseMessages: allResponseMessages,
  };
}
