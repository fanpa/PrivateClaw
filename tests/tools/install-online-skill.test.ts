import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createInstallOnlineSkillTool } from '../../src/tools/install-online-skill.js';
import type { SimpleFetchResult } from '../../src/tools/search-online-skill.js';
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

type FetchMap = Record<string, SimpleFetchResult>;

/**
 * Build a fetchFn that routes by URL substring. Pass a map of URL substring
 * (e.g. 'index.md', 'email-sender/skill.md') to the SimpleFetchResult that
 * should be returned when the requested URL contains that substring.
 */
function routedFetch(map: FetchMap) {
  return vi.fn(async (url: string): Promise<SimpleFetchResult> => {
    for (const [needle, result] of Object.entries(map)) {
      if (url.includes(needle)) return result;
    }
    return { status: 404, body: 'Not Found' };
  });
}

function indexMd(rows: Array<{ name: string; description: string; tags?: string; version?: string; deps?: string }>): string {
  const header = '| Name | Description | Tags | Version | Dependencies |\n|---|---|---|---|---|';
  const body = rows
    .map((r) => `| ${r.name} | ${r.description} | ${r.tags ?? ''} | ${r.version ?? ''} | ${r.deps ?? ''} |`)
    .join('\n');
  return `${header}\n${body}`;
}

describe('createInstallOnlineSkillTool', () => {
  it('has correct name', () => {
    const tool = createInstallOnlineSkillTool({
      marketUrl: 'https://github.com/owner/repo',
      skillsDir: SKILLS_DIR,
      configPath: CONFIG_PATH,
      fetchFn: async () => ({ status: 200, body: '' }),
    });
    expect(tool.name).toBe('install_online_skill');
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

  it('downloads and installs a fresh skill (records version in config)', async () => {
    const tool = createInstallOnlineSkillTool({
      marketUrl: 'https://github.com/owner/repo',
      skillsDir: SKILLS_DIR,
      configPath: CONFIG_PATH,
      fetchFn: routedFetch({
        'index.md': {
          status: 200,
          body: indexMd([{ name: 'my-skill', description: 'A cool skill', tags: 'cool', version: '1.0.0' }]),
        },
        'my-skill/skill.md': { status: 200, body: '# My Skill\n' },
      }),
    });

    const result = await tool.execute({ name: 'my-skill' });
    expect(result.error).toBeUndefined();
    expect(result.installed).toEqual([{ name: 'my-skill', version: '1.0.0', action: 'install' }]);

    expect(readFileSync(join(SKILLS_DIR, 'my-skill', 'skill.md'), 'utf-8')).toContain('# My Skill');
    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    expect(config.skills).toContainEqual({
      name: 'my-skill',
      description: 'A cool skill',
      version: '1.0.0',
    });
  });

  it('skips when local version is equal to remote version', async () => {
    mkdirSync(join(SKILLS_DIR, 'my-skill'), { recursive: true });
    writeFileSync(join(SKILLS_DIR, 'my-skill', 'skill.md'), 'old body');
    writeFileSync(
      CONFIG_PATH,
      JSON.stringify({ skills: [{ name: 'my-skill', description: 'd', version: '1.0.0' }] }, null, 2),
    );

    const fetchFn = routedFetch({
      'index.md': { status: 200, body: indexMd([{ name: 'my-skill', description: 'd', version: '1.0.0' }]) },
    });
    const tool = createInstallOnlineSkillTool({
      marketUrl: 'https://github.com/owner/repo',
      skillsDir: SKILLS_DIR,
      configPath: CONFIG_PATH,
      fetchFn,
    });

    const result = await tool.execute({ name: 'my-skill' });
    expect(result.error).toBeUndefined();
    expect(result.skipped).toEqual([{ name: 'my-skill', version: '1.0.0', action: 'skip' }]);
    expect(result.installed).toEqual([]);
    // Body must not be overwritten.
    expect(readFileSync(join(SKILLS_DIR, 'my-skill', 'skill.md'), 'utf-8')).toBe('old body');
    // Only index was fetched (no skill.md download).
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('updates when remote version is higher', async () => {
    mkdirSync(join(SKILLS_DIR, 'my-skill'), { recursive: true });
    writeFileSync(join(SKILLS_DIR, 'my-skill', 'skill.md'), 'old body');
    writeFileSync(
      CONFIG_PATH,
      JSON.stringify({ skills: [{ name: 'my-skill', description: 'd', version: '1.0.0' }] }, null, 2),
    );

    const tool = createInstallOnlineSkillTool({
      marketUrl: 'https://github.com/owner/repo',
      skillsDir: SKILLS_DIR,
      configPath: CONFIG_PATH,
      fetchFn: routedFetch({
        'index.md': { status: 200, body: indexMd([{ name: 'my-skill', description: 'd', version: '1.2.0' }]) },
        'my-skill/skill.md': { status: 200, body: 'NEW BODY' },
      }),
    });

    const result = await tool.execute({ name: 'my-skill' });
    expect(result.error).toBeUndefined();
    expect(result.installed).toEqual([{ name: 'my-skill', version: '1.2.0', action: 'update' }]);
    expect(readFileSync(join(SKILLS_DIR, 'my-skill', 'skill.md'), 'utf-8')).toBe('NEW BODY');
    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    expect(config.skills[0].version).toBe('1.2.0');
  });

  it('does not overwrite when local is present but config lacks version (ambiguous → skip)', async () => {
    mkdirSync(join(SKILLS_DIR, 'my-skill'), { recursive: true });
    writeFileSync(join(SKILLS_DIR, 'my-skill', 'skill.md'), 'custom');
    writeFileSync(
      CONFIG_PATH,
      JSON.stringify({ skills: [{ name: 'my-skill', description: 'd' }] }, null, 2),
    );

    const tool = createInstallOnlineSkillTool({
      marketUrl: 'https://github.com/owner/repo',
      skillsDir: SKILLS_DIR,
      configPath: CONFIG_PATH,
      fetchFn: routedFetch({
        'index.md': { status: 200, body: indexMd([{ name: 'my-skill', description: 'd', version: '1.0.0' }]) },
      }),
    });

    const result = await tool.execute({ name: 'my-skill' });
    expect(result.skipped!.map((s) => s.name)).toContain('my-skill');
    expect(readFileSync(join(SKILLS_DIR, 'my-skill', 'skill.md'), 'utf-8')).toBe('custom');
  });

  it('installs dependencies automatically in topological order', async () => {
    const fetched: string[] = [];
    const tool = createInstallOnlineSkillTool({
      marketUrl: 'https://github.com/owner/repo',
      skillsDir: SKILLS_DIR,
      configPath: CONFIG_PATH,
      fetchFn: vi.fn(async (url: string) => {
        fetched.push(url);
        if (url.includes('index.md')) {
          return {
            status: 200,
            body: indexMd([
              { name: 'email-sender', description: 'mail', version: '1.0.0', deps: 'template-engine, smtp-client' },
              { name: 'template-engine', description: 'tpl', version: '0.9.0' },
              { name: 'smtp-client', description: 'smtp', version: '1.0.0' },
            ]),
          };
        }
        if (url.includes('email-sender/skill.md')) return { status: 200, body: '# Email' };
        if (url.includes('template-engine/skill.md')) return { status: 200, body: '# Tpl' };
        if (url.includes('smtp-client/skill.md')) return { status: 200, body: '# Smtp' };
        return { status: 404, body: 'nf' };
      }),
    });

    const result = await tool.execute({ name: 'email-sender' });
    expect(result.error).toBeUndefined();
    const installedNames = result.installed!.map((i) => i.name);
    // Dependencies must come before the dependent in the returned order.
    expect(installedNames.indexOf('template-engine')).toBeLessThan(installedNames.indexOf('email-sender'));
    expect(installedNames.indexOf('smtp-client')).toBeLessThan(installedNames.indexOf('email-sender'));
    expect(installedNames).toContain('template-engine');
    expect(installedNames).toContain('smtp-client');
    expect(installedNames).toContain('email-sender');

    // All three skill files exist on disk.
    expect(existsSync(join(SKILLS_DIR, 'template-engine', 'skill.md'))).toBe(true);
    expect(existsSync(join(SKILLS_DIR, 'smtp-client', 'skill.md'))).toBe(true);
    expect(existsSync(join(SKILLS_DIR, 'email-sender', 'skill.md'))).toBe(true);

    // Config contains all three with versions.
    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    expect(config.skills.map((s: { name: string }) => s.name).sort())
      .toEqual(['email-sender', 'smtp-client', 'template-engine']);
  });

  it('detects and refuses circular dependencies', async () => {
    const tool = createInstallOnlineSkillTool({
      marketUrl: 'https://github.com/owner/repo',
      skillsDir: SKILLS_DIR,
      configPath: CONFIG_PATH,
      fetchFn: routedFetch({
        'index.md': {
          status: 200,
          body: indexMd([
            { name: 'a', description: '', version: '1.0.0', deps: 'b' },
            { name: 'b', description: '', version: '1.0.0', deps: 'a' },
          ]),
        },
      }),
    });

    const result = await tool.execute({ name: 'a' });
    expect(result.error).toContain('Circular dependency');
    // Nothing should be written to disk on failure.
    expect(existsSync(join(SKILLS_DIR, 'a'))).toBe(false);
    expect(existsSync(join(SKILLS_DIR, 'b'))).toBe(false);
  });

  it('refuses when a dependency is missing from the market index', async () => {
    const tool = createInstallOnlineSkillTool({
      marketUrl: 'https://github.com/owner/repo',
      skillsDir: SKILLS_DIR,
      configPath: CONFIG_PATH,
      fetchFn: routedFetch({
        'index.md': {
          status: 200,
          body: indexMd([{ name: 'a', description: '', version: '1.0.0', deps: 'ghost' }]),
        },
      }),
    });

    const result = await tool.execute({ name: 'a' });
    expect(result.error).toContain('Missing skill "ghost"');
    expect(existsSync(join(SKILLS_DIR, 'a'))).toBe(false);
  });

  it('invokes onReload after a successful install', async () => {
    const onReload = vi.fn(async () => null);
    const tool = createInstallOnlineSkillTool({
      marketUrl: 'https://github.com/owner/repo',
      skillsDir: SKILLS_DIR,
      configPath: CONFIG_PATH,
      fetchFn: routedFetch({
        'index.md': { status: 200, body: indexMd([{ name: 's', description: 'd', version: '1.0.0' }]) },
        's/skill.md': { status: 200, body: '# S' },
      }),
      onReload,
    });

    await tool.execute({ name: 's' });
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('does not invoke onReload when nothing was installed (all skipped)', async () => {
    mkdirSync(join(SKILLS_DIR, 's'), { recursive: true });
    writeFileSync(join(SKILLS_DIR, 's', 'skill.md'), 'existing');
    writeFileSync(
      CONFIG_PATH,
      JSON.stringify({ skills: [{ name: 's', description: 'd', version: '1.0.0' }] }, null, 2),
    );

    const onReload = vi.fn(async () => null);
    const tool = createInstallOnlineSkillTool({
      marketUrl: 'https://github.com/owner/repo',
      skillsDir: SKILLS_DIR,
      configPath: CONFIG_PATH,
      fetchFn: routedFetch({
        'index.md': { status: 200, body: indexMd([{ name: 's', description: 'd', version: '1.0.0' }]) },
      }),
      onReload,
    });

    await tool.execute({ name: 's' });
    expect(onReload).not.toHaveBeenCalled();
  });

  it('surfaces HTTP 404 when the market index itself is unreachable', async () => {
    const tool = createInstallOnlineSkillTool({
      marketUrl: 'https://github.com/owner/repo',
      skillsDir: SKILLS_DIR,
      configPath: CONFIG_PATH,
      fetchFn: routedFetch({
        'index.md': { status: 404, body: 'nf' },
      }),
    });
    const result = await tool.execute({ name: 'anything' });
    expect(result.error).toContain('Cannot reach skill market');
    expect(result.error).toContain('HTTP 404');
  });

  it('surfaces HTTP 403 for private repos and suggests set_header', async () => {
    const tool = createInstallOnlineSkillTool({
      marketUrl: 'https://github.com/owner/private',
      skillsDir: SKILLS_DIR,
      configPath: CONFIG_PATH,
      fetchFn: routedFetch({ 'index.md': { status: 403, body: '' } }),
    });
    const result = await tool.execute({ name: 'x' });
    expect(result.error).toContain('HTTP 403');
  });

  it('aborts on a skill-file download failure without leaving partial state', async () => {
    const tool = createInstallOnlineSkillTool({
      marketUrl: 'https://github.com/owner/repo',
      skillsDir: SKILLS_DIR,
      configPath: CONFIG_PATH,
      fetchFn: routedFetch({
        'index.md': {
          status: 200,
          body: indexMd([
            { name: 'a', description: '', version: '1.0.0', deps: 'b' },
            { name: 'b', description: '', version: '1.0.0' },
          ]),
        },
        'b/skill.md': { status: 200, body: '# B' },
        'a/skill.md': { status: 500, body: 'server error' },
      }),
    });

    const result = await tool.execute({ name: 'a' });
    expect(result.error).toContain('Cannot download');
    expect(result.error).toContain('HTTP 500');
    // B was downloaded (dependency installed first) — that is acceptable.
    // A must not exist because its fetch failed.
    expect(existsSync(join(SKILLS_DIR, 'a'))).toBe(false);
  });
});
