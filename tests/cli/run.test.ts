import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRunAgentTurn = vi.fn();
vi.mock('../../src/agent/loop.js', () => ({
  runAgentTurn: (...args: unknown[]) => mockRunAgentTurn(...args),
}));

vi.mock('../../src/provider/registry.js', () => ({
  getModel: vi.fn(),
  getRestrictedFetch: vi.fn().mockReturnValue(globalThis.fetch),
}));

vi.mock('../../src/tools/registry.js', () => ({
  getBuiltinTools: vi.fn().mockReturnValue({}),
}));

import { executeRun } from '../../src/cli/run.js';

describe('executeRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls runAgentTurn with the prompt as user message', async () => {
    mockRunAgentTurn.mockResolvedValue({
      text: 'Agent response',
      responseMessages: [],
    });

    const output = await executeRun({
      prompt: 'Hello agent',
      temperature: 0.3,
    });

    expect(mockRunAgentTurn).toHaveBeenCalledTimes(1);
    const callArgs = mockRunAgentTurn.mock.calls[0][0];
    expect(callArgs.messages).toEqual([{ role: 'user', content: 'Hello agent' }]);
    expect(callArgs.temperature).toBe(0.3);
    expect(output).toBe('Agent response');
  });

  it('auto-approves all tool calls', async () => {
    mockRunAgentTurn.mockResolvedValue({
      text: 'done',
      responseMessages: [],
    });

    await executeRun({ prompt: 'do something' });

    const callArgs = mockRunAgentTurn.mock.calls[0][0];
    const decision = await callArgs.onToolApproval('bash_exec', { command: 'rm -rf /' });
    expect(decision).toBe('allow_once');
  });

  it('loads skill content and uses it as prompt when skill option is provided', async () => {
    mockRunAgentTurn.mockResolvedValue({
      text: 'skill result',
      responseMessages: [],
    });

    const output = await executeRun({
      prompt: 'Execute the loaded skill workflow',
      skillName: 'failure-analysis',
      skills: [{ name: 'failure-analysis', description: 'Analyze failures' }],
      skillsDir: './skills',
    });

    expect(output).toBe('skill result');
    const callArgs = mockRunAgentTurn.mock.calls[0][0];
    expect(callArgs.skills).toEqual([{ name: 'failure-analysis', description: 'Analyze failures' }]);
  });

  it('passes defaultHeaders and reflectionLoops', async () => {
    mockRunAgentTurn.mockResolvedValue({
      text: 'ok',
      responseMessages: [],
    });

    await executeRun({
      prompt: 'test',
      reflectionLoops: 2,
      defaultHeaders: { 'api.com': { Authorization: 'Bearer x' } },
    });

    const callArgs = mockRunAgentTurn.mock.calls[0][0];
    expect(callArgs.reflectionLoops).toBe(2);
    expect(callArgs.defaultHeaders).toEqual({ 'api.com': { Authorization: 'Bearer x' } });
  });

  it('returns empty string when agent returns no text', async () => {
    mockRunAgentTurn.mockResolvedValue({
      text: '',
      responseMessages: [],
    });

    const output = await executeRun({ prompt: 'test' });
    expect(output).toBe('');
  });
});
