import type { ModelMessage } from 'ai';
import { runAgentTurn } from '../agent/loop.js';
import type { SkillConfig } from '../skills/types.js';
import { loadSkillContent } from '../skills/loader.js';

export interface RunOptions {
  prompt: string;
  skillName?: string;
  temperature?: number;
  reflectionLoops?: number;
  defaultHeaders?: Record<string, Record<string, string>>;
  skills?: SkillConfig[];
  skillsDir?: string;
}

export async function executeRun(options: RunOptions): Promise<string> {
  const messages: ModelMessage[] = [];

  if (options.skillName && options.skillsDir) {
    try {
      const skillContent = loadSkillContent(options.skillName, options.skillsDir);
      messages.push({
        role: 'user',
        content: `Follow this skill workflow:\n\n${skillContent}\n\nNow execute: ${options.prompt}`,
      });
    } catch {
      messages.push({ role: 'user', content: options.prompt });
    }
  } else {
    messages.push({ role: 'user', content: options.prompt });
  }

  const result = await runAgentTurn({
    messages,
    temperature: options.temperature,
    reflectionLoops: options.reflectionLoops,
    defaultHeaders: options.defaultHeaders,
    skills: options.skills,
    skillsDir: options.skillsDir,
    onToolApproval: async () => 'allow_once' as const,
  });

  return result.text;
}
