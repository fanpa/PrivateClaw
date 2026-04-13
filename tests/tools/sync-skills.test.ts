import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSyncSkillsTool } from '../../src/tools/sync-skills.js';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = join(import.meta.dirname, '__fixtures_sync__');
const SKILLS_DIR = join(TEST_DIR, 'skills');
const CONFIG_PATH = join(TEST_DIR, 'config.json');

beforeEach(() => {
  mkdirSync(SKILLS_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

function writeConfig(skills: Array<{ name: string; description: string }>) {
  writeFileSync(CONFIG_PATH, JSON.stringify({ skills }, null, 2), 'utf-8');
}

function readConfig() {
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
}

function createSkillFile(name: string, content: string) {
  const dir = join(SKILLS_DIR, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'skill.md'), content, 'utf-8');
}

describe('createSyncSkillsTool', () => {
  it('has correct name', () => {
    const tool = createSyncSkillsTool(CONFIG_PATH, SKILLS_DIR);
    expect(tool.name).toBe('sync_skills');
  });

  it('adds skills found in directory but not in config', async () => {
    writeConfig([]);
    createSkillFile('my-skill', '# My Skill\nA cool skill');
    const tool = createSyncSkillsTool(CONFIG_PATH, SKILLS_DIR);
    const result = await tool.execute({});
    expect(result.added).toContain('my-skill');
    const config = readConfig();
    expect(config.skills).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'my-skill' })]),
    );
  });

  it('reports orphaned skills in config but not in directory', async () => {
    writeConfig([{ name: 'deleted-skill', description: 'gone' }]);
    const tool = createSyncSkillsTool(CONFIG_PATH, SKILLS_DIR);
    const result = await tool.execute({});
    expect(result.orphaned).toContain('deleted-skill');
  });

  it('removes orphaned skills when remove flag is set', async () => {
    writeConfig([{ name: 'deleted-skill', description: 'gone' }]);
    const tool = createSyncSkillsTool(CONFIG_PATH, SKILLS_DIR);
    const result = await tool.execute({ removeOrphaned: true });
    expect(result.removed).toContain('deleted-skill');
    const config = readConfig();
    expect(config.skills).toEqual([]);
  });

  it('does nothing when already in sync', async () => {
    writeConfig([{ name: 'existing', description: 'exists' }]);
    createSkillFile('existing', '# Existing\nexists');
    const tool = createSyncSkillsTool(CONFIG_PATH, SKILLS_DIR);
    const result = await tool.execute({});
    expect(result.added).toEqual([]);
    expect(result.orphaned).toEqual([]);
  });
});
