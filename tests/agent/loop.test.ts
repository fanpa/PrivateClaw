import { describe, it, expect, vi } from 'vitest';
import { runAgentTurn } from '../../src/agent/loop.js';
import type { ModelMessage } from 'ai';

vi.mock('ai', async () => {
  const actual = await vi.importActual('ai');
  return {
    ...actual,
    streamText: vi.fn().mockReturnValue({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: 'Hello, ' };
        yield { type: 'text-delta', text: 'world!' };
      })(),
      text: Promise.resolve('Hello, world!'),
      response: Promise.resolve({
        messages: [{ role: 'assistant', content: 'Hello, world!' }],
      }),
      finishReason: Promise.resolve('stop'),
    }),
  };
});

vi.mock('../../src/tools/registry.js', () => ({
  getBuiltinTools: vi.fn().mockReturnValue({}),
}));

describe('runAgentTurn', () => {
  it('returns streamed text from the agent', async () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Hi there' },
    ];

    const chunks: string[] = [];
    const result = await runAgentTurn({
      messages,
      model: {} as any,
      onChunk: (chunk) => chunks.push(chunk),
    });

    expect(result.text).toBe('Hello, world!');
    expect(chunks).toEqual(['Hello, ', 'world!']);
    expect(result.responseMessages).toHaveLength(1);
  });

  it('passes onToolApproval to getBuiltinTools as onApproval', async () => {
    const { getBuiltinTools } = await import('../../src/tools/registry.js');
    const messages: ModelMessage[] = [{ role: 'user', content: 'Hi' }];
    const onToolApproval = vi.fn().mockResolvedValue('allow_once');

    await runAgentTurn({ messages, model: {} as any, onToolApproval });

    expect(getBuiltinTools).toHaveBeenCalledWith(
      expect.objectContaining({ onApproval: onToolApproval }),
    );
  });

  it('does not abort in stream consumer when tool-call event is received with onToolApproval', async () => {
    const { streamText } = await import('ai');
    (streamText as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      fullStream: (async function* () {
        yield { type: 'tool-call', toolName: 'file_read', input: { filePath: '/tmp/x' } };
        yield { type: 'text-delta', text: 'done' };
      })(),
      text: Promise.resolve('done'),
      response: Promise.resolve({ messages: [] }),
      finishReason: Promise.resolve('stop'),
    });

    const onToolApproval = vi.fn().mockResolvedValue('deny');
    const messages: ModelMessage[] = [{ role: 'user', content: 'Hi' }];

    const result = await runAgentTurn({ messages, model: {} as any, onToolApproval });

    // Stream consumer must NOT abort — approval is handled inside tool execute
    expect(result.aborted).toBeUndefined();
    expect(result.text).toBe('done');
  });
});
