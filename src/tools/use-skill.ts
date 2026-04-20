import { z } from 'zod';
import { loadSkillContent } from '../skills/loader.js';
import type { SkillConfig } from '../skills/types.js';
import { defineTool } from './define-tool.js';

interface UseSkillResult {
  content?: string;
  error?: string;
}

const parameters = z.object({
  name: z.string().describe('The name of the skill to load'),
});

export function createUseSkillTool(skills: SkillConfig[], skillsDir: string) {
  const registeredNames = new Set(skills.map((s) => s.name));

  return defineTool({
    name: 'use_skill' as const,
    description: 'Load a skill document by name. The skill contains workflow instructions to follow.',
    toolDescription:
      'Load a skill document by name. The skill contains workflow instructions to follow. Call this when you need to follow a specific workflow or procedure.',
    parameters,
    execute: async ({ name }): Promise<UseSkillResult> => {
      if (!registeredNames.has(name)) {
        const available = skills.map((s) => s.name).join(', ');
        return {
          error: `Skill "${name}" is not registered. Available skills: ${available || 'none'}`,
        };
      }
      try {
        const content = loadSkillContent(name, skillsDir);
        return { content };
      } catch (err) {
        return {
          error: `Failed to load skill "${name}": ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  });
}
