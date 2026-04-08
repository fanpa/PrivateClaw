import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAgentTurn } from '../../src/agent/loop.js';
import type { ModelMessage } from 'ai';

vi.mock('ai', async () => {
  const actual = await vi.importActual('ai');
  return {
    ...actual,
    streamText: vi.fn().mockImplementation(() => ({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: 'Hello, ' };
        yield { type: 'text-delta', text: 'world!' };
      })(),
      text: Promise.resolve('Hello, world!'),
      response: Promise.resolve({
        messages: [{ role: 'assistant', content: 'Hello, world!' }],
      }),
      finishReason: Promise.resolve('stop'),
    })),
    generateText: vi.fn().mockResolvedValue({ text: '[LGTM]' }),
  };
});

vi.mock('../../src/tools/registry.js', () => ({
  getBuiltinTools: vi.fn().mockReturnValue({}),
}));

describe('runAgentTurn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns streamed text from the agent', async () => {
    const { streamText } = await import('ai');
    (streamText as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: 'Hello, ' };
        yield { type: 'text-delta', text: 'world!' };
      })(),
      text: Promise.resolve('Hello, world!'),
      response: Promise.resolve({
        messages: [{ role: 'assistant', content: 'Hello, world!' }],
      }),
      finishReason: Promise.resolve('stop'),
    });

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
    const { streamText } = await import('ai');
    (streamText as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: 'Hi' };
      })(),
      response: Promise.resolve({ messages: [] }),
    });

    const { getBuiltinTools } = await import('../../src/tools/registry.js');
    const messages: ModelMessage[] = [{ role: 'user', content: 'Hi' }];
    const onToolApproval = vi.fn().mockResolvedValue('allow_once');

    await runAgentTurn({ messages, model: {} as any, onToolApproval });

    expect(getBuiltinTools).toHaveBeenCalledWith(
      expect.objectContaining({ onApproval: onToolApproval }),
    );
  });

  it('does NOT call onChunk during streaming when reflectionLoops > 0; emits full text once after LGTM', async () => {
    const messages: ModelMessage[] = [{ role: 'user', content: 'Hi' }];
    const chunks: string[] = [];

    await runAgentTurn({
      messages,
      model: {} as any,
      reflectionLoops: 1,
      onChunk: (chunk) => chunks.push(chunk),
    });

    // Text is buffered; emitted once after reflection (LGTM, no change)
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe('Hello, world!');
  });

  it('emits updated text via onChunk after reflection changes the answer', async () => {
    const { generateText } = await import('ai');
    (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      text: 'Corrected answer.',
    });

    const messages: ModelMessage[] = [{ role: 'user', content: 'Hi' }];
    const chunks: string[] = [];

    const result = await runAgentTurn({
      messages,
      model: {} as any,
      reflectionLoops: 1,
      onChunk: (chunk) => chunks.push(chunk),
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe('Corrected answer.');
    expect(result.text).toBe('Corrected answer.');
  });

  it('passes onBeforeToolExecute to getBuiltinTools when reflectionLoops > 0', async () => {
    const { getBuiltinTools } = await import('../../src/tools/registry.js');
    const messages: ModelMessage[] = [{ role: 'user', content: 'Hi' }];

    await runAgentTurn({
      messages,
      model: {} as any,
      reflectionLoops: 1,
    });

    expect(getBuiltinTools).toHaveBeenCalledWith(
      expect.objectContaining({ onBeforeToolExecute: expect.any(Function) }),
    );
  });

  it('does not pass onBeforeToolExecute to getBuiltinTools when reflectionLoops is 0', async () => {
    const { getBuiltinTools } = await import('../../src/tools/registry.js');
    const messages: ModelMessage[] = [{ role: 'user', content: 'Hi' }];

    await runAgentTurn({
      messages,
      model: {} as any,
      reflectionLoops: 0,
    });

    expect(getBuiltinTools).toHaveBeenCalledWith(
      expect.objectContaining({ onBeforeToolExecute: undefined }),
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

  it('issues a separate streamText call per step to prevent TypeError: terminated on connection reuse', async () => {
    const { streamText } = await import('ai');

    // Step 1: model calls a tool (no final text yet)
    (streamText as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      fullStream: (async function* () {
        yield { type: 'tool-call', toolName: 'file_read', input: { filePath: '/tmp/x' } };
        yield { type: 'tool-result', toolName: 'file_read', output: 'file content' };
      })(),
      response: Promise.resolve({
        messages: [
          {
            role: 'assistant',
            content: [{ type: 'tool-call', toolCallId: 'id1', toolName: 'file_read', args: { filePath: '/tmp/x' } }],
          },
          {
            role: 'tool',
            content: [{ type: 'tool-result', toolCallId: 'id1', result: 'file content' }],
          },
        ],
      }),
    });

    // Step 2: model responds with final text after seeing tool results
    (streamText as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: 'The file contains: file content' };
      })(),
      response: Promise.resolve({
        messages: [{ role: 'assistant', content: 'The file contains: file content' }],
      }),
    });

    const messages: ModelMessage[] = [{ role: 'user', content: 'Read /tmp/x' }];
    const toolCalls: string[] = [];
    const toolResults: unknown[] = [];

    const result = await runAgentTurn({
      messages,
      model: {} as any,
      onToolCall: (name) => toolCalls.push(name),
      onToolResult: (_name, r) => toolResults.push(r),
    });

    // Two separate streamText calls — each with its own fresh HTTP connection
    expect(streamText).toHaveBeenCalledTimes(2);
    expect(toolCalls).toEqual(['file_read']);
    expect(toolResults).toEqual(['file content']);
    expect(result.text).toBe('The file contains: file content');

    // Second call must include the tool call + tool result messages from step 1
    const secondCallMessages = (streamText as ReturnType<typeof vi.fn>).mock.calls[1][0]
      .messages as ModelMessage[];
    const hasToolCallMsg = secondCallMessages.some(
      (m) =>
        Array.isArray(m.content) &&
        (m.content as Array<{ type: string }>).some((c) => c.type === 'tool-call'),
    );
    expect(hasToolCallMsg).toBe(true);
  });
});
