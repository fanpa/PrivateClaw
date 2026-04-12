import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateText = vi.fn();
vi.mock('ai', async () => {
  const actual = await vi.importActual('ai');
  return {
    ...actual,
    generateText: (...args: unknown[]) => mockGenerateText(...args),
  };
});

import { createDelegateTool } from '../../src/tools/delegate.js';
import type { LanguageModel } from 'ai';

describe('createDelegateTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct name', () => {
    const tool = createDelegateTool([]);
    expect(tool.name).toBe('delegate');
  });

  it('returns error when no specialists configured', async () => {
    const tool = createDelegateTool([]);
    const result = await tool.execute({ specialist: 'coding', task: 'write code' });
    expect(result.error).toContain('No specialists configured');
  });

  it('returns error for unknown specialist role', async () => {
    const specialists = [
      { role: 'coding', model: {} as LanguageModel, description: 'Code tasks' },
    ];
    const tool = createDelegateTool(specialists);
    const result = await tool.execute({ specialist: 'math', task: '2+2' });
    expect(result.error).toContain('not found');
    expect(result.error).toContain('coding');
  });

  it('calls generateText with specialist model and returns result', async () => {
    mockGenerateText.mockResolvedValue({ text: 'specialist response' });

    const mockModel = {} as LanguageModel;
    const specialists = [
      { role: 'coding', model: mockModel, description: 'Code tasks' },
    ];
    const tool = createDelegateTool(specialists);
    const result = await tool.execute({ specialist: 'coding', task: 'write hello world' });

    expect(result.response).toBe('specialist response');
    expect(result.error).toBeUndefined();
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: mockModel,
        prompt: 'write hello world',
      }),
    );
  });

  it('returns error when generateText fails', async () => {
    mockGenerateText.mockRejectedValue(new Error('API timeout'));

    const specialists = [
      { role: 'reasoning', model: {} as LanguageModel, description: 'Reasoning' },
    ];
    const tool = createDelegateTool(specialists);
    const result = await tool.execute({ specialist: 'reasoning', task: 'think hard' });

    expect(result.error).toContain('API timeout');
  });

  describe('tool object (AI SDK path)', () => {
    it('has inputSchema defined', () => {
      const tool = createDelegateTool([]);
      expect(tool.tool.inputSchema).toBeDefined();
    });

    it('inputSchema parses valid input', () => {
      const tool = createDelegateTool([]);
      const schema = tool.tool.inputSchema as import('zod').ZodSchema;
      const parsed = schema.parse({ specialist: 'coding', task: 'do something' });
      expect(parsed.specialist).toBe('coding');
      expect(parsed.task).toBe('do something');
    });
  });
});
