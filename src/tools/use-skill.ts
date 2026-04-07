import { z } from 'zod';
import { zodSchema } from 'ai';
import { loadSkillContent } from '../skills/loader.js';
import type { SkillConfig } from '../skills/types.js';

interface UseSkillResult {
  content?: string;
  error?: string;
}

const parameters = z.object({
  name: z.string().describe('The name of the skill to load'),
});

function doLoadSkill(
  name: string,
  registeredNames: Set<string>,
  skills: SkillConfig[],
  skillsDir: string,
): UseSkillResult {
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
}

export function createUseSkillTool(skills: SkillConfig[], skillsDir: string) {
  const registeredNames = new Set(skills.map((s) => s.name));

  return {
    name: 'use_skill' as const,
    description: 'Load a skill document by name. The skill contains workflow instructions to follow.',
    tool: {
      description: 'Load a skill document by name. The skill contains workflow instructions to follow. Call this when you need to follow a specific workflow or procedure.',
      inputSchema: zodSchema(parameters),
      execute: async ({ name }: z.infer<typeof parameters>): Promise<UseSkillResult> => {
        return doLoadSkill(name, registeredNames, skills, skillsDir);
      },
    },
    execute: async (params: { name: string }): Promise<UseSkillResult> => {
      return doLoadSkill(params.name, registeredNames, skills, skillsDir);
    },
  };
}
