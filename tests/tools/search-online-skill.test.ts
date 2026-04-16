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
  it('converts github repo URL to raw URL', () => {
    expect(toRawUrl('https://github.com/owner/repo', 'index.md'))
      .toBe('https://raw.githubusercontent.com/owner/repo/main/index.md');
  });

  it('handles trailing slash', () => {
    expect(toRawUrl('https://github.com/owner/repo/', 'skill/skill.md'))
      .toBe('https://raw.githubusercontent.com/owner/repo/main/skill/skill.md');
  });

  it('falls back for non-github URLs', () => {
    expect(toRawUrl('https://custom.com/skills', 'index.md'))
      .toBe('https://custom.com/skills/index.md');
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
});
