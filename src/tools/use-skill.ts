import { z } from 'zod';
import { loadSkillContent } from '../skills/loader.js';
import type { SkillConfig } from '../skills/types.js';

interface UseSkillResult {
  content?: string;
  error?: string;
}

const parameters = z.object({
  skillName: z.string().describe('The name of the skill to load'),
});

function doLoadSkill(
  skillName: string,
  registeredNames: Set<string>,
  skills: SkillConfig[],
  skillsDir: string,
): UseSkillResult {
  if (!registeredNames.has(skillName)) {
    const available = skills.map((s) => s.name).join(', ');
    return {
      error: `Skill "${skillName}" is not registered. Available skills: ${available || 'none'}`,
    };
  }

  try {
    const content = loadSkillContent(skillName, skillsDir);
    return { content };
  } catch (err) {
    return {
      error: `Failed to load skill "${skillName}": ${err instanceof Error ? err.message : String(err)}`,
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
      parameters,
      execute: async ({ skillName }: z.infer<typeof parameters>): Promise<UseSkillResult> => {
        return doLoadSkill(skillName, registeredNames, skills, skillsDir);
      },
    },
    execute: async (params: { skillName: string }): Promise<UseSkillResult> => {
      return doLoadSkill(params.skillName, registeredNames, skills, skillsDir);
    },
  };
}
