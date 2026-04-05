import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createUseSkillTool } from '../../src/tools/use-skill.js';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_SKILLS_DIR = join(import.meta.dirname, '__test_skills__');

beforeEach(() => {
  mkdirSync(join(TEST_SKILLS_DIR, 'my-skill'), { recursive: true });
  writeFileSync(
    join(TEST_SKILLS_DIR, 'my-skill', 'skill.md'),
    '# My Skill\n\nDo something useful.',
  );
});

afterEach(() => {
  rmSync(TEST_SKILLS_DIR, { recursive: true, force: true });
});

describe('createUseSkillTool', () => {
  const skills = [{ name: 'my-skill', description: 'A test skill' }];

  it('has correct name', () => {
    const tool = createUseSkillTool(skills, TEST_SKILLS_DIR);
    expect(tool.name).toBe('use_skill');
  });

  it('loads a registered skill', async () => {
    const tool = createUseSkillTool(skills, TEST_SKILLS_DIR);
    const result = await tool.execute({ skillName: 'my-skill' });
    expect(result.content).toContain('# My Skill');
    expect(result.content).toContain('Do something useful');
  });

  it('returns error for unregistered skill', async () => {
    const tool = createUseSkillTool(skills, TEST_SKILLS_DIR);
    const result = await tool.execute({ skillName: 'unknown' });
    expect(result.error).toContain('not registered');
  });

  it('returns error for missing skill file', async () => {
    const skillsWithMissing = [{ name: 'ghost', description: 'Does not exist on disk' }];
    const tool = createUseSkillTool(skillsWithMissing, TEST_SKILLS_DIR);
    const result = await tool.execute({ skillName: 'ghost' });
    expect(result.error).toBeDefined();
  });

  it('includes available skills list in error for unregistered skill', async () => {
    const tool = createUseSkillTool(skills, TEST_SKILLS_DIR);
    const result = await tool.execute({ skillName: 'wrong' });
    expect(result.error).toContain('my-skill');
  });
});
