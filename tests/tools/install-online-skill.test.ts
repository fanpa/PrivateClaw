import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createInstallOnlineSkillTool } from '../../src/tools/install-online-skill.js';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = join(import.meta.dirname, '__fixtures_install__');
const SKILLS_DIR = join(TEST_DIR, 'skills');
const CONFIG_PATH = join(TEST_DIR, 'config.json');

beforeEach(() => {
  mkdirSync(SKILLS_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify({ skills: [] }, null, 2), 'utf-8');
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('createInstallOnlineSkillTool', () => {
  it('has correct name', () => {
    const tool = createInstallOnlineSkillTool({
      marketUrl: 'https://github.com/owner/repo',
      skillsDir: SKILLS_DIR,
      configPath: CONFIG_PATH,
      fetchFn: async () => ({ status: 200, body: '# Test' }),
    });
    expect(tool.name).toBe('install_online_skill');
  });

  it('downloads and installs a skill', async () => {
    const tool = createInstallOnlineSkillTool({
      marketUrl: 'https://github.com/owner/repo',
      skillsDir: SKILLS_DIR,
      configPath: CONFIG_PATH,
      fetchFn: async () => ({ status: 200, body: '# My Skill\nA great skill for testing' }),
    });

    const result = await tool.execute({ name: 'my-skill' });
    expect(result.error).toBeUndefined();
    expect(result.message).toContain('my-skill');

    const skillPath = join(SKILLS_DIR, 'my-skill', 'skill.md');
    expect(existsSync(skillPath)).toBe(true);
    expect(readFileSync(skillPath, 'utf-8')).toContain('# My Skill');

    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    expect(config.skills).toContainEqual(expect.objectContaining({ name: 'my-skill' }));
  });

  it('returns error when market URL not configured', async () => {
    const tool = createInstallOnlineSkillTool({
      marketUrl: undefined,
      skillsDir: SKILLS_DIR,
      configPath: CONFIG_PATH,
      fetchFn: async () => ({ status: 200, body: '' }),
    });

    const result = await tool.execute({ name: 'test' });
    expect(result.error).toContain('not configured');
  });

  it('returns error when fetch fails', async () => {
    const tool = createInstallOnlineSkillTool({
      marketUrl: 'https://github.com/owner/repo',
      skillsDir: SKILLS_DIR,
      configPath: CONFIG_PATH,
      fetchFn: async () => ({ error: 'Not found' }),
    });

    const result = await tool.execute({ name: 'nonexistent' });
    expect(result.error).toContain('Failed');
  });

  it('does not overwrite existing skill', async () => {
    const skillDir = join(SKILLS_DIR, 'existing-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'skill.md'), 'custom content');

    const tool = createInstallOnlineSkillTool({
      marketUrl: 'https://github.com/owner/repo',
      skillsDir: SKILLS_DIR,
      configPath: CONFIG_PATH,
      fetchFn: async () => ({ status: 200, body: '# New Content' }),
    });

    const result = await tool.execute({ name: 'existing-skill' });
    expect(result.error).toContain('already exists');
    expect(readFileSync(join(skillDir, 'skill.md'), 'utf-8')).toBe('custom content');
  });
});
