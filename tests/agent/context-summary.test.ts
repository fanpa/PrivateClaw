import { describe, it, expect } from 'vitest';
import { buildContextSummary } from '../../src/agent/context-summary.js';

describe('buildContextSummary', () => {
  it('extracts last user message', () => {
    const messages = [
      { role: 'user', content: 'Jira에서 이슈 가져와줘' },
    ];
    const summary = buildContextSummary(messages as any);
    expect(summary).toContain('Jira에서 이슈 가져와줘');
  });

  it('detects active skill from use_skill tool call', () => {
    const messages = [
      { role: 'user', content: '이슈 가져와줘' },
      {
        role: 'assistant',
        content: [
          { type: 'tool-call', toolName: 'use_skill', args: { name: 'jira-issue-export' } },
        ],
      },
      {
        role: 'tool',
        content: [
          { type: 'tool-result', toolName: 'use_skill', result: { content: '# Jira Export' } },
        ],
      },
    ];
    const summary = buildContextSummary(messages as any);
    expect(summary).toContain('jira-issue-export');
    expect(summary).toMatch(/Active skill.*jira-issue-export/);
  });

  it('lists recent tool calls', () => {
    const messages = [
      { role: 'user', content: 'test' },
      {
        role: 'assistant',
        content: [
          { type: 'tool-call', toolName: 'shell_exec', args: { command: 'pwd' } },
        ],
      },
      {
        role: 'tool',
        content: [
          { type: 'tool-result', toolName: 'shell_exec', result: { stdout: '/root' } },
        ],
      },
      {
        role: 'assistant',
        content: [
          { type: 'tool-call', toolName: 'file_read', args: { filePath: '/root/config.json' } },
        ],
      },
      {
        role: 'tool',
        content: [
          { type: 'tool-result', toolName: 'file_read', result: '{}' },
        ],
      },
    ];
    const summary = buildContextSummary(messages as any);
    expect(summary).toContain('shell_exec');
    expect(summary).toContain('file_read');
  });

  it('returns minimal summary for empty messages', () => {
    const summary = buildContextSummary([]);
    expect(summary).toContain('No context');
  });

  it('indicates no active skill when none loaded', () => {
    const messages = [
      { role: 'user', content: '안녕' },
    ];
    const summary = buildContextSummary(messages as any);
    expect(summary).toMatch(/Active skill.*none/);
  });

  it('keeps only last 5 tool calls', () => {
    const messages: any[] = [{ role: 'user', content: 'test' }];
    for (let i = 0; i < 8; i++) {
      messages.push({
        role: 'assistant',
        content: [{ type: 'tool-call', toolName: `tool_${i}`, args: {} }],
      });
    }
    const summary = buildContextSummary(messages);
    expect(summary).not.toContain('tool_0');
    expect(summary).not.toContain('tool_1');
    expect(summary).not.toContain('tool_2');
    expect(summary).toContain('tool_3');
    expect(summary).toContain('tool_7');
  });
});
