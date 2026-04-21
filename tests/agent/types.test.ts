import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../../src/agent/types.js';

describe('buildSystemPrompt', () => {
  it('instructs the model to match the user language', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toMatch(/same language as the user's most recent message/i);
    // Guard against English drift: the rule must explicitly forbid silent switching.
    expect(prompt).toMatch(/do not drift to english/i);
  });

  it('keeps the language rule regardless of skills or specialists', () => {
    const withSkills = buildSystemPrompt(
      [{ name: 'foo', description: 'bar' }],
      ['reasoning'],
    );
    expect(withSkills).toMatch(/same language as the user/i);
  });
});
