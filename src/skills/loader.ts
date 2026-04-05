import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SkillConfig } from './types.js';

export function loadSkillContent(skillName: string, skillsDir: string): string {
  const skillPath = join(skillsDir, skillName, 'skill.md');
  return readFileSync(skillPath, 'utf-8');
}

export function listSkills(skills: SkillConfig[]): string {
  if (skills.length === 0) return 'No skills registered.';
  return skills.map((s) => `- ${s.name}: ${s.description}`).join('\n');
}
