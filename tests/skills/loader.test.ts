import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadSkillContent, listSkills } from '../../src/skills/loader.js';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_SKILLS_DIR = join(import.meta.dirname, '__test_skills__');

beforeEach(() => {
  mkdirSync(join(TEST_SKILLS_DIR, 'failure-analysis'), { recursive: true });
  writeFileSync(
    join(TEST_SKILLS_DIR, 'failure-analysis', 'skill.md'),
    '# Failure Analysis\n\n## Workflow\n\n1. If error log exists, read it.\n2. Summarize the root cause.',
  );
  mkdirSync(join(TEST_SKILLS_DIR, 'code-review'), { recursive: true });
  writeFileSync(
    join(TEST_SKILLS_DIR, 'code-review', 'skill.md'),
    '# Code Review\n\n## Workflow\n\n1. Read the changed files.\n2. Check for bugs.',
  );
});

afterEach(() => {
  rmSync(TEST_SKILLS_DIR, { recursive: true, force: true });
});

describe('loadSkillContent', () => {
  it('loads skill.md content by name', () => {
    const content = loadSkillContent('failure-analysis', TEST_SKILLS_DIR);
    expect(content).toContain('# Failure Analysis');
    expect(content).toContain('Summarize the root cause');
  });

  it('throws on non-existent skill', () => {
    expect(() => loadSkillContent('nonexistent', TEST_SKILLS_DIR)).toThrow();
  });
});

describe('listSkills', () => {
  it('lists all skills from config', () => {
    const skills = [
      { name: 'failure-analysis', description: 'Analyze failures from logs' },
      { name: 'code-review', description: 'Review code changes' },
    ];
    const list = listSkills(skills);
    expect(list).toContain('failure-analysis');
    expect(list).toContain('Analyze failures from logs');
    expect(list).toContain('code-review');
  });

  it('returns empty message when no skills', () => {
    const list = listSkills([]);
    expect(list).toContain('No skills');
  });
});
