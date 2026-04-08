import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createCreateSkillTool } from '../../src/tools/create-skill.js';
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = join(import.meta.dirname, '__test_create_skill__');
const TEST_SKILLS_DIR = join(TEST_DIR, 'skills');
const TEST_CONFIG_PATH = join(TEST_DIR, 'privateclaw.config.json');

const baseConfig = {
  provider: { type: 'openai', baseURL: 'http://localhost:8080/v1', model: 'gpt-4o' },
  security: { allowedDomains: [], defaultHeaders: {} },
  session: { dbPath: './test.db' },
  skills: [],
  skillsDir: './skills',
};

beforeEach(() => {
  mkdirSync(TEST_SKILLS_DIR, { recursive: true });
  writeFileSync(TEST_CONFIG_PATH, JSON.stringify(baseConfig, null, 2));
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('createCreateSkillTool', () => {
  it('has correct name and description', () => {
    const tool = createCreateSkillTool(TEST_SKILLS_DIR, TEST_CONFIG_PATH);
    expect(tool.name).toBe('create_skill');
    expect(tool.description).toBeDefined();
  });

  it('creates skill.md file in correct directory', async () => {
    const tool = createCreateSkillTool(TEST_SKILLS_DIR, TEST_CONFIG_PATH);
    const result = await tool.execute({
      name: 'log-analysis',
      description: 'Analyze server logs',
      content: '# Log Analysis\n\nAnalyze server logs step by step.',
    });

    expect(result.error).toBeUndefined();
    expect(result.created).toBe(true);

    const skillPath = join(TEST_SKILLS_DIR, 'log-analysis', 'skill.md');
    expect(existsSync(skillPath)).toBe(true);
    expect(readFileSync(skillPath, 'utf-8')).toBe('# Log Analysis\n\nAnalyze server logs step by step.');
  });

  it('registers skill in config.json', async () => {
    const tool = createCreateSkillTool(TEST_SKILLS_DIR, TEST_CONFIG_PATH);
    await tool.execute({
      name: 'log-analysis',
      description: 'Analyze server logs',
      content: '# Log Analysis\n\nWorkflow here.',
    });

    const config = JSON.parse(readFileSync(TEST_CONFIG_PATH, 'utf-8'));
    expect(config.skills).toContainEqual({
      name: 'log-analysis',
      description: 'Analyze server logs',
    });
  });

  it('preserves existing config fields when adding skill', async () => {
    const configWithExisting = {
      ...baseConfig,
      skills: [{ name: 'existing', description: 'An existing skill' }],
    };
    writeFileSync(TEST_CONFIG_PATH, JSON.stringify(configWithExisting, null, 2));

    const tool = createCreateSkillTool(TEST_SKILLS_DIR, TEST_CONFIG_PATH);
    await tool.execute({
      name: 'new-skill',
      description: 'A new skill',
      content: '# New Skill',
    });

    const config = JSON.parse(readFileSync(TEST_CONFIG_PATH, 'utf-8'));
    expect(config.skills).toHaveLength(2);
    expect(config.skills[0]).toEqual({ name: 'existing', description: 'An existing skill' });
    expect(config.skills[1]).toEqual({ name: 'new-skill', description: 'A new skill' });
    expect(config.provider.type).toBe('openai');
  });

  it('returns error if skill name already exists in config', async () => {
    const configWithExisting = {
      ...baseConfig,
      skills: [{ name: 'dupe', description: 'Existing' }],
    };
    writeFileSync(TEST_CONFIG_PATH, JSON.stringify(configWithExisting, null, 2));

    const tool = createCreateSkillTool(TEST_SKILLS_DIR, TEST_CONFIG_PATH);
    const result = await tool.execute({
      name: 'dupe',
      description: 'Duplicate',
      content: '# Dupe',
    });

    expect(result.error).toContain('already exists');
    expect(result.created).toBeUndefined();
  });

  it('returns error if skill directory already exists on disk', async () => {
    mkdirSync(join(TEST_SKILLS_DIR, 'taken'), { recursive: true });
    writeFileSync(join(TEST_SKILLS_DIR, 'taken', 'skill.md'), '# Taken');

    const tool = createCreateSkillTool(TEST_SKILLS_DIR, TEST_CONFIG_PATH);
    const result = await tool.execute({
      name: 'taken',
      description: 'Already there',
      content: '# Taken Again',
    });

    expect(result.error).toContain('already exists');
  });

  describe('tool object (AI SDK path)', () => {
    it('has inputSchema defined', () => {
      const tool = createCreateSkillTool(TEST_SKILLS_DIR, TEST_CONFIG_PATH);
      expect(tool.tool.inputSchema).toBeDefined();
    });

    it('inputSchema parses valid input', () => {
      const tool = createCreateSkillTool(TEST_SKILLS_DIR, TEST_CONFIG_PATH);
      const schema = tool.tool.inputSchema as import('zod').ZodSchema;
      const parsed = schema.parse({
        name: 'test',
        description: 'Test skill',
        content: '# Test',
      });
      expect(parsed.name).toBe('test');
    });

    it('inputSchema rejects missing fields', () => {
      const tool = createCreateSkillTool(TEST_SKILLS_DIR, TEST_CONFIG_PATH);
      const schema = tool.tool.inputSchema as import('zod').ZodSchema;
      expect(() => schema.parse({ name: 'test' })).toThrow();
      expect(() => schema.parse({})).toThrow();
    });

    it('rejects path traversal in skill name', async () => {
      const tool = createCreateSkillTool(TEST_SKILLS_DIR, TEST_CONFIG_PATH);
      const schema = tool.tool.inputSchema as import('zod').ZodSchema;
      expect(() => schema.parse({ name: '../evil', description: 'x', content: 'x' })).toThrow();
      expect(() => schema.parse({ name: 'foo/bar', description: 'x', content: 'x' })).toThrow();
      expect(() => schema.parse({ name: '.hidden', description: 'x', content: 'x' })).toThrow();
    });

    it('tool.execute works via AI SDK path', async () => {
      const tool = createCreateSkillTool(TEST_SKILLS_DIR, TEST_CONFIG_PATH);
      const result = await tool.tool.execute(
        { name: 'sdk-test', description: 'SDK test', content: '# SDK' },
        { toolCallId: 'test', messages: [] } as never,
      );
      expect(result.created).toBe(true);
    });
  });
});
