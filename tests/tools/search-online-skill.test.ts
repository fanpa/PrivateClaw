import { describe, it, expect } from 'vitest';
import {
  createSearchOnlineSkillTool,
  parseSkillIndex,
  toRawUrl,
  matchesTags,
} from '../../src/tools/search-online-skill.js';

describe('parseSkillIndex', () => {
  it('parses legacy 2-column tables (back-compat)', () => {
    const markdown = `# Skill Market

| Name | Description |
|------|-------------|
| jira-export | Jira REST API를 사용하여 이슈를 CSV로 내보냅니다 |
| slack-notify | Slack Webhook을 통해 알림을 전송합니다 |
`;
    const skills = parseSkillIndex(markdown);
    expect(skills).toHaveLength(2);
    expect(skills[0]).toEqual({
      name: 'jira-export',
      description: 'Jira REST API를 사용하여 이슈를 CSV로 내보냅니다',
      tags: [],
      version: undefined,
      dependencies: [],
    });
  });

  it('parses 5-column tables with tags, version, dependencies', () => {
    const markdown = `| Name | Description | Tags | Version | Dependencies |
|------|-------------|------|---------|--------------|
| email-sender | Sends emails via SMTP | email, send, notify | 1.2.0 | template-engine, smtp-client |
| template-engine | Mustache-style rendering | template, render | 0.9.0 | |
| old-style | Legacy skill ||||
`;
    const skills = parseSkillIndex(markdown);
    expect(skills).toHaveLength(3);
    expect(skills[0]).toEqual({
      name: 'email-sender',
      description: 'Sends emails via SMTP',
      tags: ['email', 'send', 'notify'],
      version: '1.2.0',
      dependencies: ['template-engine', 'smtp-client'],
    });
    expect(skills[1].tags).toEqual(['template', 'render']);
    expect(skills[1].dependencies).toEqual([]);
    expect(skills[2].tags).toEqual([]);
    expect(skills[2].version).toBeUndefined();
    expect(skills[2].dependencies).toEqual([]);
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

  it('normalizes tags to lowercase', () => {
    const markdown = `| Name | Description | Tags |
|------|-------------|------|
| a | b | Foo, BAR, baz |`;
    const skills = parseSkillIndex(markdown);
    expect(skills[0].tags).toEqual(['foo', 'bar', 'baz']);
  });
});

describe('matchesTags', () => {
  const skill = { name: 'x', description: 'y', tags: ['email', 'notify'], dependencies: [] };

  it('returns true when no query tags are provided', () => {
    expect(matchesTags(skill, undefined)).toBe(true);
    expect(matchesTags(skill, [])).toBe(true);
  });

  it('matches with OR semantics — any single overlap counts', () => {
    expect(matchesTags(skill, ['email'])).toBe(true);
    expect(matchesTags(skill, ['notify'])).toBe(true);
    expect(matchesTags(skill, ['email', 'send'])).toBe(true);
    expect(matchesTags(skill, ['unrelated', 'notify'])).toBe(true);
  });

  it('returns false when no query tag overlaps', () => {
    expect(matchesTags(skill, ['slack', 'jira'])).toBe(false);
  });

  it('treats a skill with no tags as universal — always matches', () => {
    const universal = { name: 'u', description: '', tags: [], dependencies: [] };
    expect(matchesTags(universal, ['any'])).toBe(true);
    expect(matchesTags(universal, ['foo', 'bar'])).toBe(true);
  });

  it('normalizes the query tags (trim + lowercase) before comparing', () => {
    expect(matchesTags(skill, ['  EMAIL  '])).toBe(true);
    expect(matchesTags(skill, ['Notify'])).toBe(true);
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
  const indexMd = `| Name | Description | Tags | Version |
|------|-------------|------|---------|
| jira-export | Jira issue exporter | jira, ticket, export | 1.0.0 |
| slack-notify | Slack notification | slack, notify, send | 0.2.0 |
| universal | No tags — always returned ||0.1.0|
| email-sender | Send emails | email, send, notify | 1.1.0 |`;

  function newTool(body = indexMd) {
    return createSearchOnlineSkillTool(
      'https://github.com/owner/repo',
      async () => ({ status: 200, body }),
    );
  }

  it('has correct name', () => {
    const tool = createSearchOnlineSkillTool(
      'https://github.com/owner/repo',
      async () => ({ status: 200, body: '' }),
    );
    expect(tool.name).toBe('search_online_skill');
  });

  it('returns error when no market URL configured', async () => {
    const tool = createSearchOnlineSkillTool(undefined, async () => ({ status: 200, body: '' }));
    const result = await tool.execute({});
    expect(result.error).toContain('not configured');
  });

  it('returns every skill when no tags supplied', async () => {
    const result = await newTool().execute({});
    expect(result.skills).toHaveLength(4);
  });

  it('filters by tags using OR semantics', async () => {
    const result = await newTool().execute({ tags: ['jira'] });
    // jira-export matches directly; universal always matches.
    const names = result.skills!.map((s) => s.name).sort();
    expect(names).toEqual(['jira-export', 'universal']);
  });

  it('OR across multiple tags returns union', async () => {
    const result = await newTool().execute({ tags: ['email', 'slack'] });
    const names = result.skills!.map((s) => s.name).sort();
    expect(names).toEqual(['email-sender', 'slack-notify', 'universal']);
  });

  it('single tag that matches several via "notify" yields all of them plus universal', async () => {
    const result = await newTool().execute({ tags: ['notify'] });
    const names = result.skills!.map((s) => s.name).sort();
    expect(names).toEqual(['email-sender', 'slack-notify', 'universal']);
  });

  it('normalizes query tags (upper/mixed case, whitespace)', async () => {
    const result = await newTool().execute({ tags: ['  EMAIL  ', 'JIRA'] });
    const names = result.skills!.map((s) => s.name).sort();
    expect(names).toEqual(['email-sender', 'jira-export', 'universal']);
  });

  it('returns only the universal skill when no tags overlap', async () => {
    const result = await newTool().execute({ tags: ['nonexistent'] });
    const names = result.skills!.map((s) => s.name);
    expect(names).toEqual(['universal']);
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
  });

  it('mentions set_header hint on 403 (private repo likely)', async () => {
    const tool = createSearchOnlineSkillTool(
      'https://github.com/owner/private-repo',
      async () => ({ status: 403, body: '' }),
    );
    const result = await tool.execute({});
    expect(result.error).toContain('HTTP 403');
    expect(result.error).toContain('set_header');
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

  it('surfaces empty 200 body as error', async () => {
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
