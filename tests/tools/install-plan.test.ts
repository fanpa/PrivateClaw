import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { buildInstallPlan, formatInstallSummary } from '../../src/tools/install-plan.js';
import type { SkillIndexEntry, SkillConfig } from '../../src/skills/types.js';

const TEST_DIR = join(import.meta.dirname, '__fixtures_plan__');
const SKILLS_DIR = join(TEST_DIR, 'skills');

beforeEach(() => {
  mkdirSync(SKILLS_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

function entry(
  name: string,
  version?: string,
  dependencies: string[] = [],
): SkillIndexEntry {
  return { name, description: `desc-${name}`, tags: [], version, dependencies };
}

function seedDisk(name: string, content = 'body'): void {
  const dir = join(SKILLS_DIR, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'skill.md'), content);
}

describe('buildInstallPlan', () => {
  it('plans a fresh single-skill install', () => {
    const res = buildInstallPlan({
      target: 'a',
      marketEntries: [entry('a', '1.0.0')],
      localSkills: [],
      skillsDir: SKILLS_DIR,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.plan).toEqual([
      expect.objectContaining({ name: 'a', action: 'install', remoteVersion: '1.0.0' }),
    ]);
  });

  it('plans dependencies in topological order (deps before dependents)', () => {
    const res = buildInstallPlan({
      target: 'a',
      marketEntries: [
        entry('a', '1.0.0', ['b', 'c']),
        entry('b', '1.0.0'),
        entry('c', '1.0.0', ['d']),
        entry('d', '1.0.0'),
      ],
      localSkills: [],
      skillsDir: SKILLS_DIR,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const names = res.plan.map((n) => n.name);
    expect(names.indexOf('d')).toBeLessThan(names.indexOf('c'));
    expect(names.indexOf('c')).toBeLessThan(names.indexOf('a'));
    expect(names.indexOf('b')).toBeLessThan(names.indexOf('a'));
    expect(names[names.length - 1]).toBe('a');
  });

  it('skips when local version >= remote version', () => {
    seedDisk('a');
    const local: SkillConfig[] = [{ name: 'a', description: 'd', version: '1.0.0' }];
    const res = buildInstallPlan({
      target: 'a',
      marketEntries: [entry('a', '1.0.0')],
      localSkills: local,
      skillsDir: SKILLS_DIR,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.plan[0].action).toBe('skip');
  });

  it('updates when remote version > local version', () => {
    seedDisk('a');
    const local: SkillConfig[] = [{ name: 'a', description: 'd', version: '1.0.0' }];
    const res = buildInstallPlan({
      target: 'a',
      marketEntries: [entry('a', '1.2.0')],
      localSkills: local,
      skillsDir: SKILLS_DIR,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.plan[0].action).toBe('update');
    expect(res.plan[0].localVersion).toBe('1.0.0');
    expect(res.plan[0].remoteVersion).toBe('1.2.0');
  });

  it('skips when local exists but either side lacks version info (ambiguous)', () => {
    seedDisk('a');
    // local has no version
    const res = buildInstallPlan({
      target: 'a',
      marketEntries: [entry('a', '1.0.0')],
      localSkills: [{ name: 'a', description: 'd' }],
      skillsDir: SKILLS_DIR,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.plan[0].action).toBe('skip');
  });

  it('detects direct cycles', () => {
    const res = buildInstallPlan({
      target: 'a',
      marketEntries: [entry('a', '1.0.0', ['a'])],
      localSkills: [],
      skillsDir: SKILLS_DIR,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain('Circular');
  });

  it('detects indirect cycles', () => {
    const res = buildInstallPlan({
      target: 'a',
      marketEntries: [
        entry('a', '1.0.0', ['b']),
        entry('b', '1.0.0', ['c']),
        entry('c', '1.0.0', ['a']),
      ],
      localSkills: [],
      skillsDir: SKILLS_DIR,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain('Circular');
  });

  it('fails on missing dependency with helpful message', () => {
    const res = buildInstallPlan({
      target: 'a',
      marketEntries: [entry('a', '1.0.0', ['ghost'])],
      localSkills: [],
      skillsDir: SKILLS_DIR,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain('Missing skill "ghost"');
    expect(res.error).toContain('required by a');
  });

  it('handles diamond dependency without duplicating a shared dep', () => {
    const res = buildInstallPlan({
      target: 'a',
      marketEntries: [
        entry('a', '1.0.0', ['b', 'c']),
        entry('b', '1.0.0', ['d']),
        entry('c', '1.0.0', ['d']),
        entry('d', '1.0.0'),
      ],
      localSkills: [],
      skillsDir: SKILLS_DIR,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const dOccurrences = res.plan.filter((n) => n.name === 'd').length;
    expect(dOccurrences).toBe(1);
  });
});

describe('formatInstallSummary', () => {
  it('groups actions and includes versions', () => {
    const plan = [
      { name: 'b', action: 'install' as const, remoteVersion: '0.9.0', description: '' },
      { name: 'c', action: 'skip' as const, localVersion: '1.0.0', remoteVersion: '1.0.0', description: '' },
      { name: 'a', action: 'update' as const, localVersion: '1.0.0', remoteVersion: '1.2.0', description: '' },
    ];
    const summary = formatInstallSummary('a', plan);
    expect(summary).toContain('Installed');
    expect(summary).toContain('b v0.9.0');
    expect(summary).toContain('Updated');
    expect(summary).toContain('a v1.0.0 → v1.2.0');
    expect(summary).toContain('Up-to-date');
    expect(summary).toContain('c v1.0.0');
  });

  it('returns a "nothing to do" message for empty plans', () => {
    expect(formatInstallSummary('x', [])).toContain('Nothing to do');
  });
});
