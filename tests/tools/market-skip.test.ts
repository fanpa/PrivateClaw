import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { getBuiltinTools } from '../../src/tools/registry.js';

const TEST_DIR = join(import.meta.dirname, '__fixtures_market_skip__');
const CONFIG_PATH = join(TEST_DIR, 'config.json');
const SKILLS_DIR = join(TEST_DIR, 'skills');

beforeEach(() => {
  mkdirSync(SKILLS_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify({ skills: [] }, null, 2), 'utf-8');
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('market tools skip pre-reflect and approval where appropriate (issue #90)', () => {
  it('search_online_skill skips onPreReflect', async () => {
    const onPreReflect = vi.fn().mockResolvedValue({ proceed: true, message: 'ok' });
    const fakeFetch: typeof globalThis.fetch = async () =>
      new Response('| Name | Description |\n|---|---|\n| a | b |', { status: 200 }) as never;

    const tools = getBuiltinTools({
      fetchFn: fakeFetch,
      configPath: CONFIG_PATH,
      skillsDir: SKILLS_DIR,
      skillMarketUrl: 'https://github.com/owner/repo',
      onPreReflect,
    });

    await tools['search_online_skill'].execute({}, {} as never);
    expect(onPreReflect).not.toHaveBeenCalled();
  });

  it('search_online_skill skips onApproval', async () => {
    const onApproval = vi.fn().mockResolvedValue('deny');
    const fakeFetch: typeof globalThis.fetch = async () =>
      new Response('| Name | Description |\n|---|---|\n| a | b |', { status: 200 }) as never;

    const tools = getBuiltinTools({
      fetchFn: fakeFetch,
      configPath: CONFIG_PATH,
      skillsDir: SKILLS_DIR,
      skillMarketUrl: 'https://github.com/owner/repo',
      onApproval,
    });

    const result = await tools['search_online_skill'].execute({}, {} as never);
    expect(onApproval).not.toHaveBeenCalled();
    // Tool must actually run and return skills — not a "denied by user" error.
    expect(result).not.toEqual({ error: 'Tool execution denied by user.' });
  });

  it('install_online_skill skips onPreReflect', async () => {
    const onPreReflect = vi.fn().mockResolvedValue({ proceed: true, message: 'ok' });
    const fakeFetch: typeof globalThis.fetch = async () =>
      new Response('# Dummy', { status: 200 }) as never;

    const tools = getBuiltinTools({
      fetchFn: fakeFetch,
      configPath: CONFIG_PATH,
      skillsDir: SKILLS_DIR,
      skillMarketUrl: 'https://github.com/owner/repo',
      onPreReflect,
    });

    await tools['install_online_skill'].execute({ name: 'test-skill' }, {} as never);
    expect(onPreReflect).not.toHaveBeenCalled();
  });

  it('install_online_skill still runs approval (writes to disk)', async () => {
    const onApproval = vi.fn().mockResolvedValue('deny');
    const fakeFetch: typeof globalThis.fetch = async () =>
      new Response('# Dummy', { status: 200 }) as never;

    const tools = getBuiltinTools({
      fetchFn: fakeFetch,
      configPath: CONFIG_PATH,
      skillsDir: SKILLS_DIR,
      skillMarketUrl: 'https://github.com/owner/repo',
      onApproval,
    });

    const result = await tools['install_online_skill'].execute({ name: 'test-skill' }, {} as never);
    expect(onApproval).toHaveBeenCalled();
    expect(result).toEqual({ error: 'Tool execution denied by user.' });
  });
});
