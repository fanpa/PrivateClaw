import { describe, it, expect, afterEach } from 'vitest';
import { executeInit, autoRegisterSkills } from '../../src/cli/init.js';
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = join(import.meta.dirname, '__test_init__');
const TEST_CONFIG = join(TEST_DIR, 'config.json');
const TEST_SKILLS = join(TEST_DIR, 'skills');

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('executeInit', () => {
  it('creates config file when it does not exist', () => {
    const result = executeInit(TEST_CONFIG, TEST_SKILLS);
    expect(result.created.length).toBeGreaterThan(0);
    expect(existsSync(TEST_CONFIG)).toBe(true);

    const config = JSON.parse(readFileSync(TEST_CONFIG, 'utf-8'));
    expect(config.provider).toBeDefined();
    expect(config.skills.length).toBeGreaterThan(0);
  });

  it('creates default skill files', () => {
    executeInit(TEST_CONFIG, TEST_SKILLS);
    expect(existsSync(join(TEST_SKILLS, 'failure-analysis', 'skill.md'))).toBe(true);
  });

  it('does not overwrite existing config', () => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(TEST_CONFIG, '{"custom": true}');

    const result = executeInit(TEST_CONFIG, TEST_SKILLS);
    expect(result.created).not.toContain(TEST_CONFIG);

    const config = JSON.parse(readFileSync(TEST_CONFIG, 'utf-8'));
    expect(config.custom).toBe(true);
  });

  it('does not overwrite existing skill files', () => {
    mkdirSync(join(TEST_SKILLS, 'failure-analysis'), { recursive: true });
    writeFileSync(join(TEST_SKILLS, 'failure-analysis', 'skill.md'), 'custom content');

    executeInit(TEST_CONFIG, TEST_SKILLS);
    expect(readFileSync(join(TEST_SKILLS, 'failure-analysis', 'skill.md'), 'utf-8')).toBe('custom content');
  });
});

describe('autoRegisterSkills', () => {
  it('registers skills found in skillsDir but not in config', () => {
    mkdirSync(join(TEST_SKILLS, 'new-skill'), { recursive: true });
    writeFileSync(join(TEST_SKILLS, 'new-skill', 'skill.md'), '# New Skill\n\nA new skill description.');
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(TEST_CONFIG, JSON.stringify({ skills: [] }, null, 2));

    const newSkills = autoRegisterSkills(TEST_CONFIG, TEST_SKILLS);
    expect(newSkills).toEqual(['new-skill']);

    const config = JSON.parse(readFileSync(TEST_CONFIG, 'utf-8'));
    expect(config.skills).toContainEqual(expect.objectContaining({ name: 'new-skill' }));
  });

  it('does not re-register already registered skills', () => {
    mkdirSync(join(TEST_SKILLS, 'existing'), { recursive: true });
    writeFileSync(join(TEST_SKILLS, 'existing', 'skill.md'), '# Existing');
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(TEST_CONFIG, JSON.stringify({
      skills: [{ name: 'existing', description: 'Already registered' }],
    }, null, 2));

    const newSkills = autoRegisterSkills(TEST_CONFIG, TEST_SKILLS);
    expect(newSkills).toEqual([]);
  });

  it('ignores directories without skill.md', () => {
    mkdirSync(join(TEST_SKILLS, 'no-skill'), { recursive: true });
    writeFileSync(join(TEST_SKILLS, 'no-skill', 'README.md'), 'Not a skill');
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(TEST_CONFIG, JSON.stringify({ skills: [] }, null, 2));

    const newSkills = autoRegisterSkills(TEST_CONFIG, TEST_SKILLS);
    expect(newSkills).toEqual([]);
  });

  it('parses description from skill.md second line', () => {
    mkdirSync(join(TEST_SKILLS, 'described'), { recursive: true });
    writeFileSync(join(TEST_SKILLS, 'described', 'skill.md'), '# My Skill\n\nThis is the description.');
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(TEST_CONFIG, JSON.stringify({ skills: [] }, null, 2));

    autoRegisterSkills(TEST_CONFIG, TEST_SKILLS);
    const config = JSON.parse(readFileSync(TEST_CONFIG, 'utf-8'));
    expect(config.skills[0].description).toBe('This is the description.');
  });
});
