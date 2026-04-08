import { z } from 'zod';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

interface CreateSkillResult {
  created?: boolean;
  skillPath?: string;
  error?: string;
}

const parameters = z.object({
  name: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, 'Skill name must start with alphanumeric and contain only alphanumeric, hyphens, underscores').describe('Skill name (used as folder name, e.g. "log-analysis")'),
  description: z.string().describe('One-line description of what the skill does'),
  content: z.string().describe('Full markdown content for skill.md'),
});

function doCreateSkill(
  name: string,
  description: string,
  content: string,
  skillsDir: string,
  configPath: string,
): CreateSkillResult {
  const skillDir = join(skillsDir, name);
  if (existsSync(skillDir)) {
    return { error: `Skill "${name}" already exists at ${skillDir}` };
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);
    const skills: Array<{ name: string; description: string }> = config.skills ?? [];

    if (skills.some((s) => s.name === name)) {
      return { error: `Skill "${name}" already exists in config` };
    }

    mkdirSync(skillDir, { recursive: true });
    const skillPath = join(skillDir, 'skill.md');
    writeFileSync(skillPath, content, 'utf-8');

    skills.push({ name, description });
    config.skills = skills;
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    return { created: true, skillPath };
  } catch (err) {
    return {
      error: `Failed to create skill "${name}": ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function createCreateSkillTool(skillsDir: string, configPath: string) {
  return {
    name: 'create_skill' as const,
    description: 'Create a new skill by writing a skill.md file and registering it in the config.',
    tool: {
      description:
        'Create a new skill. Writes a skill.md file to the skills directory and registers it in privateclaw.config.json. Use this when the user wants to create a new reusable workflow.',
      inputSchema: parameters,
      execute: async (
        { name, description, content }: z.infer<typeof parameters>,
      ): Promise<CreateSkillResult> => {
        return doCreateSkill(name, description, content, skillsDir, configPath);
      },
    },
    execute: async (params: {
      name: string;
      description: string;
      content: string;
    }): Promise<CreateSkillResult> => {
      return doCreateSkill(params.name, params.description, params.content, skillsDir, configPath);
    },
  };
}
