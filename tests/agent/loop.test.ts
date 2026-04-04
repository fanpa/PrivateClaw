import { describe, it, expect, vi } from 'vitest';
import { runAgentTurn } from '../../src/agent/loop.js';
import type { CoreMessage } from 'ai';

vi.mock('ai', async () => {
  const actual = await vi.importActual('ai');
  return {
    ...actual,
    streamText: vi.fn().mockReturnValue({
      fullStream: (async function* () {
        yield { type: 'text-delta', textDelta: 'Hello, ' };
        yield { type: 'text-delta', textDelta: 'world!' };
      })(),
      text: Promise.resolve('Hello, world!'),
      response: Promise.resolve({
        messages: [{ role: 'assistant', content: 'Hello, world!' }],
      }),
      finishReason: Promise.resolve('stop'),
    }),
  };
});

describe('runAgentTurn', () => {
  it('returns streamed text from the agent', async () => {
    const messages: CoreMessage[] = [
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
});
