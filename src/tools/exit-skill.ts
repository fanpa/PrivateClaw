import { z } from 'zod';
import type { SkillStateManager } from '../skills/state.js';
import { defineTool } from './define-tool.js';

interface ExitSkillResult {
  exited?: string;
  current?: string | null;
  stack?: string[];
  message?: string;
  error?: string;
}

const parameters = z.object({});

export function createExitSkillTool(manager: SkillStateManager) {
  return defineTool({
    name: 'exit_skill' as const,
    description: 'Exit the current skill and return to the parent skill or end skill mode.',
    toolDescription:
      'Pop the current skill off the active-skill stack. Call this when the current skill workflow is complete. If a parent skill is on the stack, it becomes active again; otherwise skill mode ends. Takes no arguments.',
    parameters,
    execute: async (): Promise<ExitSkillResult> => {
      const popped = manager.pop();
      if (!popped) {
        return { error: 'No active skill to exit.' };
      }
      const top = manager.top();
      return {
        exited: popped.name,
        current: top ? top.name : null,
        stack: manager.names(),
        message: top
          ? `Exited "${popped.name}"; now active: "${top.name}".`
          : `Exited "${popped.name}"; no skill active.`,
      };
    },
  });
}
