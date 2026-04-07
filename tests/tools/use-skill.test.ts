import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { createUseSkillTool } from '../../src/tools/use-skill.js';
import { assertToolStructure } from './helpers.js';
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
    const result = await tool.execute({ name: 'my-skill' });
    expect(result.content).toContain('# My Skill');
    expect(result.content).toContain('Do something useful');
  });

  it('returns error for unregistered skill', async () => {
    const tool = createUseSkillTool(skills, TEST_SKILLS_DIR);
    const result = await tool.execute({ name: 'unknown' });
    expect(result.error).toContain('not registered');
  });

  it('returns error for missing skill file', async () => {
    const skillsWithMissing = [{ name: 'ghost', description: 'Does not exist on disk' }];
    const tool = createUseSkillTool(skillsWithMissing, TEST_SKILLS_DIR);
    const result = await tool.execute({ name: 'ghost' });
    expect(result.error).toBeDefined();
  });

  it('includes available skills list in error for unregistered skill', async () => {
    const tool = createUseSkillTool(skills, TEST_SKILLS_DIR);
    const result = await tool.execute({ name: 'wrong' });
    expect(result.error).toContain('my-skill');
  });
});

describe('createUseSkillTool inputSchema and AI SDK path', () => {
  const skills = [{ name: 'my-skill', description: 'A test skill' }];

  it('has valid tool structure with inputSchema', () => {
    const tool = createUseSkillTool(skills, TEST_SKILLS_DIR);
    assertToolStructure(tool);
  });

  it('inputSchema accepts valid name', () => {
    const tool = createUseSkillTool(skills, TEST_SKILLS_DIR);
    const schema = tool.tool.inputSchema as z.ZodSchema;
    const result = schema.parse({ name: 'my-skill' });
    expect(result.name).toBe('my-skill');
  });

  it('inputSchema rejects missing name', () => {
    const tool = createUseSkillTool(skills, TEST_SKILLS_DIR);
    const schema = tool.tool.inputSchema as z.ZodSchema;
    expect(() => schema.parse({})).toThrow();
  });

  it('tool.execute works when called via inputSchema parse (AI SDK path)', async () => {
    const tool = createUseSkillTool(skills, TEST_SKILLS_DIR);
    const schema = tool.tool.inputSchema as z.ZodSchema;
    const parsedInput = schema.parse({ name: 'my-skill' });
    const result = await tool.tool.execute(parsedInput, { toolCallId: 'test', messages: [] });
    expect(result.content).toContain('# My Skill');
  });
});
