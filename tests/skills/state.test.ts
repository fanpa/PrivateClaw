import { describe, it, expect } from 'vitest';
import { SkillStateManager, buildActiveSkillSystemText } from '../../src/skills/state.js';

describe('SkillStateManager', () => {
  it('starts empty', () => {
    const m = new SkillStateManager();
    expect(m.depth()).toBe(0);
    expect(m.top()).toBeNull();
    expect(m.names()).toEqual([]);
  });

  it('push adds a frame and returns it', () => {
    const m = new SkillStateManager();
    const result = m.push('A', 'content-A');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.frame.name).toBe('A');
      expect(result.frame.content).toBe('content-A');
      expect(result.duplicated).toBe(false);
    }
    expect(m.depth()).toBe(1);
    expect(m.top()?.name).toBe('A');
  });

  it('push of duplicate skill is a no-op success', () => {
    const m = new SkillStateManager();
    m.push('A', 'content-A');
    const second = m.push('A', 'content-A-modified');
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.duplicated).toBe(true);
      // First frame's content preserved — the in-session snapshot does not change.
      expect(second.frame.content).toBe('content-A');
    }
    expect(m.depth()).toBe(1);
  });

  it('push rejects beyond maxDepth', () => {
    const m = new SkillStateManager(2);
    m.push('A', 'a');
    m.push('B', 'b');
    const result = m.push('C', 'c');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('depth limit');
    }
    expect(m.depth()).toBe(2);
  });

  it('pop returns top frame and removes it', () => {
    const m = new SkillStateManager();
    m.push('A', 'a');
    m.push('B', 'b');
    const popped = m.pop();
    expect(popped?.name).toBe('B');
    expect(m.depth()).toBe(1);
    expect(m.top()?.name).toBe('A');
  });

  it('pop on empty stack returns null', () => {
    const m = new SkillStateManager();
    expect(m.pop()).toBeNull();
  });

  it('clear empties the stack', () => {
    const m = new SkillStateManager();
    m.push('A', 'a');
    m.push('B', 'b');
    m.clear();
    expect(m.depth()).toBe(0);
  });

  it('restore loads names via the provided loader, dropping missing ones', () => {
    const m = new SkillStateManager();
    const loader = (name: string): string | null => {
      if (name === 'ghost') return null;
      if (name === 'boom') throw new Error('disk failure');
      return `content-${name}`;
    };
    m.restore(['A', 'ghost', 'boom', 'B'], loader);
    expect(m.names()).toEqual(['A', 'B']);
    expect(m.top()?.content).toBe('content-B');
  });

  it('restore stops at maxDepth', () => {
    const m = new SkillStateManager(2);
    m.restore(['A', 'B', 'C', 'D'], (n) => `content-${n}`);
    expect(m.names()).toEqual(['A', 'B']);
  });
});

describe('buildActiveSkillSystemText', () => {
  it('returns empty string when stack is empty', () => {
    expect(buildActiveSkillSystemText([])).toBe('');
  });

  it('wraps top skill content with delimiters', () => {
    const text = buildActiveSkillSystemText([
      { name: 'A', content: 'skill A body', loadedAt: '2026-04-21T00:00:00Z' },
    ]);
    expect(text).toContain('ACTIVE SKILL: A');
    expect(text).toContain('skill A body');
    expect(text).toContain('END SKILL');
    expect(text).toContain('exit_skill');
    expect(text).toContain('end skill mode');
  });

  it('mentions parent stack for nested skills', () => {
    const text = buildActiveSkillSystemText([
      { name: 'A', content: 'A-body', loadedAt: '2026-04-21T00:00:00Z' },
      { name: 'B', content: 'B-body', loadedAt: '2026-04-21T00:00:00Z' },
    ]);
    expect(text).toContain('ACTIVE SKILL: B');
    expect(text).toContain('B-body');
    expect(text).toContain('Parent stack');
    expect(text).toContain('A');
    expect(text).toContain('return to "A"');
    // Parent body is NOT inlined (token budget)
    expect(text).not.toContain('A-body');
  });
});
