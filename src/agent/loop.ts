import { streamText, generateText, stepCountIs } from 'ai';
import type { ModelMessage, LanguageModel } from 'ai';
import { getModel, getRestrictedFetch } from '../provider/registry.js';
import { getBuiltinTools } from '../tools/registry.js';
import { buildSystemPrompt, DEFAULT_MAX_STEPS, REFLECTION_PROMPT, PRE_REFLECT_PROMPT } from './types.js';
import { buildContextSummary } from './context-summary.js';
import type { PreReflectResult } from '../tools/registry.js';
import type { ApprovalDecision } from '../approval/types.js';
import type { SkillConfig } from '../skills/types.js';

export const DEFAULT_MAX_HISTORY = 20;
const TOOL_RESULT_BODY_LIMIT = 10000;
const TOOL_RESULT_BODY_KEEP = 5000;

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
  skillMarketUrl?: string;
  specialists?: import('../tools/delegate.js').SpecialistEntry[];
  onChunk?: (chunk: string) => void;
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
  onToolResult?: (toolName: string, result: unknown) => void;
  onToolApproval?: (toolName: string, args: unknown) => Promise<ApprovalDecision>;
  onReload?: () => Promise<string | null>;
  onPreReflectExplanation?: (explanation: string) => void;
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

function truncateToolResultBodies(messages: ModelMessage[]): ModelMessage[] {
  const cloned = structuredClone(messages);
  for (const msg of cloned) {
    if (msg.role !== 'tool' || !Array.isArray(msg.content)) continue;
    for (const part of msg.content) {
      const p = part as unknown as Record<string, unknown>;
      if (p.type !== 'tool-result') continue;
      const res = p.result as Record<string, unknown> | undefined;
      if (!res || typeof res.body !== 'string') continue;
      if (res.body.length > TOOL_RESULT_BODY_LIMIT) {
        res.body = (res.body as string).slice(0, TOOL_RESULT_BODY_KEEP) + '\n[truncated]';
      }
    }
  }
  return cloned;
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

  const specialistRoles = options.specialists?.map((s) => s.role) ?? [];
  const effectivePrompt = systemPrompt ?? buildSystemPrompt(options.skills, specialistRoles);
  const effectiveModel = model ?? getModel();
  const loops = options.reflectionLoops ?? 0;
  const maxHistory = options.maxHistoryMessages ?? DEFAULT_MAX_HISTORY;

  let currentMessages: ModelMessage[] = applySliding([...messages], maxHistory);

  const preReflectCallback = loops > 0
    ? async (toolName: string, args: unknown): Promise<PreReflectResult> => {
        const skillList = options.skills?.map((s) => `${s.name}: ${s.description}`).join('\n') ?? 'none';
        const contextSummary = buildContextSummary(currentMessages);
        try {
          const result = await generateText({
            model: effectiveModel,
            system: PRE_REFLECT_PROMPT,
            messages: [
              {
                role: 'user',
                content: `Tool: ${toolName}\nArgs: ${JSON.stringify(args)}\n\nAvailable skills:\n${skillList}\n\nContext:\n${contextSummary}`,
              },
            ],
            temperature: 0,
          });
          const text = result.text.trim();
          if (text.startsWith('REJECT:')) {
            return { proceed: false, message: text.slice('REJECT:'.length).trim() };
          }
          options.onPreReflectExplanation?.(text);
          return { proceed: true, message: text };
        } catch {
          return { proceed: true, message: '' };
        }
      }
    : undefined;

  const toolSet = getBuiltinTools({
    fetchFn: getRestrictedFetch(),
    defaultHeaders: options.defaultHeaders,
    allowedCommands: options.allowedCommands,
    skills: options.skills,
    skillsDir: options.skillsDir,
    configPath: options.configPath,
    specialists: options.specialists,
    onReload: options.onReload,
    onApproval: options.onToolApproval,
    onPreReflect: preReflectCallback,
    skillMarketUrl: options.skillMarketUrl,
    generateDescription: async (content: string) => {
      const result = await generateText({
        model: effectiveModel,
        messages: [
          {
            role: 'user',
            content: `You are generating a skill description for an AI agent's config file. Read the skill document below and write a single concise sentence (under 20 words) describing WHEN to use this skill. Focus on trigger conditions, not implementation details.\n\nSkill:\n${content}`,
          },
        ],
      });
      return result.text.trim();
    },
  });

  let fullText = '';
  const allResponseMessages: ModelMessage[] = [];

  // Each iteration opens a fresh HTTP connection (one streamText call = one request).
  // Drain result.response even on error to prevent dangling connections.
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

    try {
      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'text-delta':
            fullText += part.text;
            stepHasText = true;
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
    } catch (err) {
      try { await result.response; } catch { /* drain to free HTTP connection */ }
      throw err;
    }

    const response = await result.response;
    const stepMessages = response.messages as ModelMessage[];
    allResponseMessages.push(...stepMessages);

    if (stepHasText || !stepHasToolCall) break;

    // Clone before truncating so the saved history (allResponseMessages) keeps
    // the full tool result body; only the LLM context gets truncated.
    const contextMessages = truncateToolResultBodies(stepMessages);
    currentMessages = [...currentMessages, ...contextMessages];
  }

  let finalText = fullText;

  if (loops > 0 && finalText.length > 0) {
    for (let i = 0; i < loops; i++) {
      options.onReflecting?.(i + 1);
      try {
        const reflection = await reflectOnResponse(
          effectiveModel,
          applySliding(currentMessages, maxHistory),
          finalText,
          effectivePrompt,
          options.temperature,
        );
        options.onReflectionDone?.(reflection.changed);
        if (!reflection.changed) break;
        finalText = reflection.text;
      } catch {
        options.onReflectionDone?.(false);
        break;
      }
    }
    onChunk?.(finalText);
  }

  return {
    text: finalText,
    responseMessages: allResponseMessages,
  };
}
