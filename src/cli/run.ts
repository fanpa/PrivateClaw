import type { ModelMessage } from 'ai';
import { runAgentTurn } from '../agent/loop.js';
import type { SkillConfig } from '../skills/types.js';
import { loadSkillContent } from '../skills/loader.js';
import { SkillStateManager } from '../skills/state.js';

export interface RunOptions {
  prompt: string;
  skillName?: string;
  temperature?: number;
  reflectionLoops?: number;
  defaultHeaders?: Record<string, Record<string, string>>;
  allowedCommands?: string[];
  skills?: SkillConfig[];
  skillsDir?: string;
  skillMaxDepth?: number;
  specialists?: import('../tools/delegate.js').SpecialistEntry[];
}

export async function executeRun(options: RunOptions): Promise<string> {
  const skillManager = new SkillStateManager(options.skillMaxDepth ?? 5);

  if (options.skillName && options.skillsDir) {
    try {
      const skillContent = loadSkillContent(options.skillName, options.skillsDir);
      skillManager.push(options.skillName, skillContent);
    } catch {
      // Skill couldn't be loaded — fall through with an empty stack; the
      // prompt still runs, the LLM just won't have the skill in context.
    }
  }

  const messages: ModelMessage[] = [{ role: 'user', content: options.prompt }];

  const result = await runAgentTurn({
    messages,
    temperature: options.temperature,
    reflectionLoops: options.reflectionLoops,
    defaultHeaders: options.defaultHeaders,
    allowedCommands: options.allowedCommands,
    skills: options.skills,
    skillsDir: options.skillsDir,
    skillManager,
    specialists: options.specialists,
    onToolApproval: async () => 'allow_once' as const,
  });

  return result.text;
}
