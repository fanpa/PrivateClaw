import { z } from 'zod';
import { loadSkillContent } from '../skills/loader.js';
import type { SkillConfig } from '../skills/types.js';
import type { SkillStateManager } from '../skills/state.js';
import { defineTool } from './define-tool.js';

interface UseSkillResult {
  content?: string;
  stack?: string[];
  duplicated?: boolean;
  autoExited?: string[];
  error?: string;
}

const parameters = z.object({
  name: z.string().describe('The name of the skill to load'),
});

export function createUseSkillTool(
  skills: SkillConfig[],
  skillsDir: string,
  manager: SkillStateManager,
) {
  const registeredNames = new Set(skills.map((s) => s.name));

  return defineTool({
    name: 'use_skill' as const,
    description: 'Load a skill document and push it onto the active-skill stack.',
    toolDescription:
      'Load a skill document and make it the active skill. The skill stays active across turns until you call exit_skill. If a different skill is currently active, it is automatically exited first so you start fresh. Calling use_skill with the already-active skill is a no-op.',
    parameters,
    execute: async ({ name }): Promise<UseSkillResult> => {
      if (!registeredNames.has(name)) {
        const available = skills.map((s) => s.name).join(', ');
        return {
          error: `Skill "${name}" is not registered. Available skills: ${available || 'none'}`,
        };
      }

      let content: string;
      try {
        content = loadSkillContent(name, skillsDir);
      } catch (err) {
        return {
          error: `Failed to load skill "${name}": ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      // Auto-exit any active skills when switching to a different skill.
      // This recovers from the common case where the LLM forgets to call
      // exit_skill after completing a workflow before starting a new one.
      const autoExited: string[] = [];
      const currentTop = manager.top();
      if (currentTop && currentTop.name !== name) {
        while (manager.depth() > 0) {
          const popped = manager.pop();
          if (popped) autoExited.push(popped.name);
        }
      }

      const pushed = manager.push(name, content);
      if (!pushed.ok) {
        return { error: pushed.error };
      }

      return {
        content,
        stack: manager.names(),
        duplicated: pushed.duplicated,
        ...(autoExited.length > 0 ? { autoExited } : {}),
      };
    },
  });
}
