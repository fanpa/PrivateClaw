import { describe, it, expect } from 'vitest';
import { createExitSkillTool } from '../../src/tools/exit-skill.js';
import { SkillStateManager } from '../../src/skills/state.js';

describe('createExitSkillTool', () => {
  it('returns error when no active skill', async () => {
    const m = new SkillStateManager();
    const tool = createExitSkillTool(m);
    const result = await tool.execute({});
    expect(result.error).toContain('No active skill');
  });

  it('pops top skill and reports the new current frame', async () => {
    const m = new SkillStateManager();
    m.push('A', 'a');
    m.push('B', 'b');
    const tool = createExitSkillTool(m);
    const result = await tool.execute({});
    expect(result.exited).toBe('B');
    expect(result.current).toBe('A');
    expect(result.stack).toEqual(['A']);
  });

  it('pops last skill, reporting no current', async () => {
    const m = new SkillStateManager();
    m.push('A', 'a');
    const tool = createExitSkillTool(m);
    const result = await tool.execute({});
    expect(result.exited).toBe('A');
    expect(result.current).toBeNull();
    expect(result.stack).toEqual([]);
  });

  it('exposes inputSchema with no required fields', () => {
    const m = new SkillStateManager();
    const tool = createExitSkillTool(m);
    expect(tool.tool.inputSchema).toBeDefined();
    const schema = tool.tool.inputSchema as import('zod').ZodSchema;
    expect(() => schema.parse({})).not.toThrow();
  });
});
