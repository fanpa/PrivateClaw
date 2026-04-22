import { z } from 'zod';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SkillStateManager } from '../skills/state.js';
import { defineTool } from './define-tool.js';

interface UseSkillResult {
  content?: string;
  stack?: string[];
  duplicated?: boolean;
  error?: string;
}

const parameters = z.object({
  name: z.string().describe('The name of the skill to load'),
});

function listSkillsOnDisk(skillsDir: string): string[] {
  if (!existsSync(skillsDir)) return [];
  try {
    return readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((name) => existsSync(join(skillsDir, name, 'skill.md')))
      .sort();
  } catch {
    return [];
  }
}

export function createUseSkillTool(skillsDir: string, manager: SkillStateManager) {
  return defineTool({
    name: 'use_skill' as const,
    description: 'Load a skill document and push it onto the active-skill stack.',
    toolDescription:
      'Load a skill document and make it the active skill. The skill stays active across turns until you call exit_skill. Nested loads are allowed up to the configured depth limit; calling use_skill with an already-active skill is a no-op. Validated against the local skills directory, so skills installed via install_online_skill during this session are immediately available.',
    parameters,
    execute: async ({ name }): Promise<UseSkillResult> => {
      const skillPath = join(skillsDir, name, 'skill.md');

      if (!existsSync(skillPath)) {
        const available = listSkillsOnDisk(skillsDir);
        return {
          error: `Skill "${name}" is not installed locally. Available skills on disk: ${available.join(', ') || 'none'}`,
        };
      }

      let content: string;
      try {
        content = readFileSync(skillPath, 'utf-8');
      } catch (err) {
        return {
          error: `Failed to read skill "${name}": ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      const pushed = manager.push(name, content);
      if (!pushed.ok) {
        return { error: pushed.error };
      }

      return {
        content,
        stack: manager.names(),
        duplicated: pushed.duplicated,
      };
    },
  });
}
