import { describe, it, expect } from 'vitest';
import { createSearchOnlineSkillTool, parseSkillIndex, toRawUrl } from '../../src/tools/search-online-skill.js';

describe('parseSkillIndex', () => {
  it('parses markdown table from index.md', () => {
    const markdown = `# Skill Market

| Name | Description |
|------|-------------|
| jira-export | Jira REST API를 사용하여 이슈를 CSV로 내보냅니다 |
| slack-notify | Slack Webhook을 통해 알림을 전송합니다 |
`;
    const skills = parseSkillIndex(markdown);
    expect(skills).toHaveLength(2);
    expect(skills[0]).toEqual({ name: 'jira-export', description: 'Jira REST API를 사용하여 이슈를 CSV로 내보냅니다' });
    expect(skills[1]).toEqual({ name: 'slack-notify', description: 'Slack Webhook을 통해 알림을 전송합니다' });
  });

  it('returns empty array for empty content', () => {
    expect(parseSkillIndex('')).toEqual([]);
  });

  it('skips header separator row', () => {
    const markdown = `| Name | Description |
|------|-------------|
| test | A test skill |`;
    const skills = parseSkillIndex(markdown);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('test');
  });
});

describe('toRawUrl', () => {
  it('converts github.com repo URL to raw.githubusercontent.com', () => {
    expect(toRawUrl('https://github.com/owner/repo', 'index.md'))
      .toBe('https://raw.githubusercontent.com/owner/repo/main/index.md');
  });

  it('handles trailing slash', () => {
    expect(toRawUrl('https://github.com/owner/repo/', 'skill/skill.md'))
      .toBe('https://raw.githubusercontent.com/owner/repo/main/skill/skill.md');
  });

  it('uses custom branch for github.com when provided', () => {
    expect(toRawUrl('https://github.com/owner/repo', 'index.md', 'develop'))
      .toBe('https://raw.githubusercontent.com/owner/repo/develop/index.md');
  });

  it('converts GHE URL to same-host /raw/ pattern', () => {
    expect(toRawUrl('https://github.company.com/team/repo', 'index.md'))
      .toBe('https://github.company.com/team/repo/raw/main/index.md');
  });

  it('supports GHE URL with custom branch', () => {
    expect(toRawUrl('https://ghe.internal.corp/foo/bar', 'skill/skill.md', 'release'))
      .toBe('https://ghe.internal.corp/foo/bar/raw/release/skill/skill.md');
  });

  it('supports GHE URL with port', () => {
    expect(toRawUrl('https://ghe.internal.corp:8443/team/repo', 'index.md'))
      .toBe('https://ghe.internal.corp:8443/team/repo/raw/main/index.md');
  });

  it('supports GHE URL over http', () => {
    expect(toRawUrl('http://ghe.internal.corp/team/repo', 'index.md'))
      .toBe('http://ghe.internal.corp/team/repo/raw/main/index.md');
  });

  it('strips trailing slash from GHE URL', () => {
    expect(toRawUrl('https://ghe.internal.corp/team/repo/', 'index.md'))
      .toBe('https://ghe.internal.corp/team/repo/raw/main/index.md');
  });

  it('falls back for single-segment URLs (not github-like)', () => {
    expect(toRawUrl('https://custom.com/skills', 'index.md'))
      .toBe('https://custom.com/skills/index.md');
  });

  it('falls back for URLs with 3+ path segments', () => {
    expect(toRawUrl('https://custom.com/a/b/c', 'index.md'))
      .toBe('https://custom.com/a/b/c/index.md');
  });
});

describe('createSearchOnlineSkillTool', () => {
  it('has correct name', () => {
    const tool = createSearchOnlineSkillTool('https://github.com/owner/repo', async () => ({ status: 200, body: '' }));
    expect(tool.name).toBe('search_online_skill');
  });

  it('returns error when no market URL configured', async () => {
    const tool = createSearchOnlineSkillTool(undefined, async () => ({ status: 200, body: '' }));
    const result = await tool.execute({});
    expect(result.error).toContain('not configured');
  });

  it('fetches and parses skills', async () => {
    const indexMd = `| Name | Description |
|------|-------------|
| my-skill | A cool skill |`;
    const tool = createSearchOnlineSkillTool(
      'https://github.com/owner/repo',
      async () => ({ status: 200, body: indexMd }),
    );
    const result = await tool.execute({});
    expect(result.skills).toHaveLength(1);
    expect(result.skills![0].name).toBe('my-skill');
  });

  it('filters by query', async () => {
    const indexMd = `| Name | Description |
|------|-------------|
| jira-export | Jira tool |
| slack-notify | Slack tool |`;
    const tool = createSearchOnlineSkillTool(
      'https://github.com/owner/repo',
      async () => ({ status: 200, body: indexMd }),
    );
    const result = await tool.execute({ query: 'jira' });
    expect(result.skills).toHaveLength(1);
    expect(result.skills![0].name).toBe('jira-export');
  });

  it('surfaces HTTP 404 as an explicit unreachable-market error', async () => {
    const tool = createSearchOnlineSkillTool(
      'https://github.com/owner/missing',
      async () => ({ status: 404, body: '404: Not Found' }),
    );
    const result = await tool.execute({});
    expect(result.skills).toBeUndefined();
    expect(result.error).toContain('Cannot reach skill market');
    expect(result.error).toContain('HTTP 404');
    expect(result.error).toContain('main branch');
  });

  it('mentions set_header hint on 403 (private repo likely)', async () => {
    const tool = createSearchOnlineSkillTool(
      'https://github.com/owner/private-repo',
      async () => ({ status: 403, body: '' }),
    );
    const result = await tool.execute({});
    expect(result.error).toContain('HTTP 403');
    expect(result.error).toContain('set_header');
    expect(result.error).toContain('Authorization');
  });

  it('surfaces fetch error field', async () => {
    const tool = createSearchOnlineSkillTool(
      'https://github.com/owner/repo',
      async () => ({ error: 'network timeout' }),
    );
    const result = await tool.execute({});
    expect(result.error).toContain('Cannot reach skill market');
    expect(result.error).toContain('network timeout');
  });

  it('surfaces empty 200 body as error (so we do not return misleading empty list)', async () => {
    const tool = createSearchOnlineSkillTool(
      'https://github.com/owner/repo',
      async () => ({ status: 200, body: '' }),
    );
    const result = await tool.execute({});
    expect(result.skills).toBeUndefined();
    expect(result.error).toContain('empty response');
  });

  it('fetches from GHE raw path when given a GHE URL', async () => {
    const fetched: string[] = [];
    const tool = createSearchOnlineSkillTool(
      'https://ghe.internal.corp/team/repo',
      async (url) => {
        fetched.push(url);
        return { status: 200, body: '| Name | Description |\n|---|---|\n| a | b |' };
      },
    );
    await tool.execute({});
    expect(fetched).toEqual(['https://ghe.internal.corp/team/repo/raw/main/index.md']);
  });

  it('uses the provided branch for the raw URL', async () => {
    const fetched: string[] = [];
    const tool = createSearchOnlineSkillTool(
      'https://github.com/owner/repo',
      async (url) => {
        fetched.push(url);
        return { status: 200, body: '| Name | Description |\n|---|---|\n| a | b |' };
      },
      'develop',
    );
    await tool.execute({});
    expect(fetched).toEqual(['https://raw.githubusercontent.com/owner/repo/develop/index.md']);
  });
});
