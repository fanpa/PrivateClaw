import { z } from 'zod';
import { generateText } from 'ai';
import type { LanguageModel } from 'ai';
import { defineTool } from './define-tool.js';

const DEFAULT_SPECIALIST_TIMEOUT_MS = 120000;

export interface SpecialistEntry {
  role: string;
  model: LanguageModel;
  description: string;
  timeoutMs?: number;
}

interface DelegateResult {
  response?: string;
  specialist?: string;
  error?: string;
}

const parameters = z.object({
  specialist: z.string().describe('The specialist role to delegate to, e.g. "reasoning", "coding", "math"'),
  task: z.string().describe('The full task description to send to the specialist. Include all necessary context — the specialist has no conversation history.'),
});

async function doDelegate(
  specialist: string,
  task: string,
  specialists: SpecialistEntry[],
): Promise<DelegateResult> {
  if (specialists.length === 0) {
    return { error: 'No specialists configured. Add specialists to your config file.' };
  }

  const entry = specialists.find((s) => s.role === specialist);
  if (!entry) {
    const available = specialists.map((s) => `${s.role} (${s.description})`).join(', ');
    return { error: `Specialist "${specialist}" not found. Available: ${available}` };
  }

  const timeoutMs = entry.timeoutMs ?? DEFAULT_SPECIALIST_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref();

  try {
    const result = await generateText({
      model: entry.model,
      prompt: task,
      abortSignal: controller.signal,
    });
    return { response: result.text, specialist };
  } catch (err) {
    if (controller.signal.aborted) {
      return { error: `Specialist "${specialist}" timed out after ${timeoutMs}ms` };
    }
    return {
      error: `Specialist "${specialist}" failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function createDelegateTool(specialists: SpecialistEntry[]) {
  const specialistList = specialists.length > 0
    ? specialists.map((s) => `"${s.role}" — ${s.description}`).join(', ')
    : 'none configured';

  return defineTool({
    name: 'delegate' as const,
    description: `Delegate a task to a specialist model. Available: ${specialistList}`,
    toolDescription: `Delegate a task to a specialist model for higher quality results. Available: ${specialistList}`,
    parameters,
    execute: async ({ specialist, task }): Promise<DelegateResult> =>
      doDelegate(specialist, task, specialists),
  });
}
