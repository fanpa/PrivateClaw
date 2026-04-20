import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createUseSkillTool } from '../../src/tools/use-skill.js';
import { SkillStateManager } from '../../src/skills/state.js';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

function newTool(skills: { name: string; description: string }[], dir: string) {
  return createUseSkillTool(skills, dir, new SkillStateManager(5));
}

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
    const tool = newTool(skills, TEST_SKILLS_DIR);
    expect(tool.name).toBe('use_skill');
  });

  it('loads a registered skill', async () => {
    const tool = newTool(skills, TEST_SKILLS_DIR);
    const result = await tool.execute({ name: 'my-skill' });
    expect(result.content).toContain('# My Skill');
    expect(result.content).toContain('Do something useful');
  });

  it('returns error for unregistered skill', async () => {
    const tool = newTool(skills, TEST_SKILLS_DIR);
    const result = await tool.execute({ name: 'unknown' });
    expect(result.error).toContain('not registered');
  });

  it('returns error for missing skill file', async () => {
    const skillsWithMissing = [{ name: 'ghost', description: 'Does not exist on disk' }];
    const tool = newTool(skillsWithMissing, TEST_SKILLS_DIR);
    const result = await tool.execute({ name: 'ghost' });
    expect(result.error).toBeDefined();
  });

  it('includes available skills list in error for unregistered skill', async () => {
    const tool = newTool(skills, TEST_SKILLS_DIR);
    const result = await tool.execute({ name: 'wrong' });
    expect(result.error).toContain('my-skill');
  });

  describe('tool object (AI SDK path)', () => {
    it('has inputSchema defined on tool object', () => {
      const tool = newTool(skills, TEST_SKILLS_DIR);
      expect(tool.tool.inputSchema).toBeDefined();
    });

    it('inputSchema parses valid input', () => {
      const tool = newTool(skills, TEST_SKILLS_DIR);
      const schema = tool.tool.inputSchema as import('zod').ZodSchema;
      const result = schema.parse({ name: 'my-skill' });
      expect(result.name).toBe('my-skill');
    });

    it('inputSchema rejects missing name', () => {
      const tool = newTool(skills, TEST_SKILLS_DIR);
      const schema = tool.tool.inputSchema as import('zod').ZodSchema;
      expect(() => schema.parse({})).toThrow();
    });

    it('tool.execute works via inputSchema parse (simulates AI SDK call)', async () => {
      const tool = newTool(skills, TEST_SKILLS_DIR);
      const schema = tool.tool.inputSchema as import('zod').ZodSchema;
      const parsedInput = schema.parse({ name: 'my-skill' });
      const result = await tool.tool.execute(parsedInput, { toolCallId: 'test', messages: [] } as never);
      expect(result.content).toContain('# My Skill');
    });
  });

  describe('stack interaction', () => {
    it('pushes the loaded skill onto the manager', async () => {
      const manager = new SkillStateManager(5);
      const tool = createUseSkillTool(skills, TEST_SKILLS_DIR, manager);
      const result = await tool.execute({ name: 'my-skill' });
      expect(result.stack).toEqual(['my-skill']);
      expect(manager.names()).toEqual(['my-skill']);
    });

    it('second load of the same skill is a no-op and flags duplicated', async () => {
      const manager = new SkillStateManager(5);
      const tool = createUseSkillTool(skills, TEST_SKILLS_DIR, manager);
      await tool.execute({ name: 'my-skill' });
      const second = await tool.execute({ name: 'my-skill' });
      expect(second.duplicated).toBe(true);
      expect(manager.names()).toEqual(['my-skill']);
    });

    it('rejects when depth limit is reached', async () => {
      mkdirSync(join(TEST_SKILLS_DIR, 'other'), { recursive: true });
      writeFileSync(join(TEST_SKILLS_DIR, 'other', 'skill.md'), '# Other');
      const multi = [...skills, { name: 'other', description: 'other' }];
      const manager = new SkillStateManager(1);
      const tool = createUseSkillTool(multi, TEST_SKILLS_DIR, manager);
      await tool.execute({ name: 'my-skill' });
      const second = await tool.execute({ name: 'other' });
      expect(second.error).toContain('depth limit');
    });
  });
});
