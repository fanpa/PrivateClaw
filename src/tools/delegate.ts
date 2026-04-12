import { z } from 'zod';
import { generateText } from 'ai';
import type { LanguageModel } from 'ai';

export interface SpecialistEntry {
  role: string;
  model: LanguageModel;
  description: string;
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

  try {
    const result = await generateText({
      model: entry.model,
      prompt: task,
    });
    return { response: result.text, specialist };
  } catch (err) {
    return {
      error: `Specialist "${specialist}" failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function createDelegateTool(specialists: SpecialistEntry[]) {
  const specialistList = specialists.length > 0
    ? specialists.map((s) => `"${s.role}" — ${s.description}`).join(', ')
    : 'none configured';

  return {
    name: 'delegate' as const,
    description: `Delegate a task to a specialist model. Available: ${specialistList}`,
    tool: {
      description: `Delegate a task to a specialist model for higher quality results. Available: ${specialistList}`,
      inputSchema: parameters,
      execute: async ({ specialist, task }: z.infer<typeof parameters>): Promise<DelegateResult> => {
        return doDelegate(specialist, task, specialists);
      },
    },
    execute: async (params: { specialist: string; task: string }): Promise<DelegateResult> => {
      return doDelegate(params.specialist, params.task, specialists);
    },
  };
}
