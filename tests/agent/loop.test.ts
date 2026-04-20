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

  it('passes system prompt to generateText during reflection', async () => {
    const { generateText } = await import('ai');
    const messages: ModelMessage[] = [{ role: 'user', content: 'Hi' }];

    await runAgentTurn({
      messages,
      model: {} as any,
      systemPrompt: 'You are PrivateClaw.',
      reflectionLoops: 1,
    });

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({ system: 'You are PrivateClaw.' }),
    );
  });

  it('emits updated text via onChunk after reflection changes the answer', async () => {
    const { generateText } = await import('ai');
    (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      text: '[CORRECTED]\nCorrected answer.',
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

  it('strips [CORRECTED] prefix so critique never leaks to user', async () => {
    const { generateText } = await import('ai');
    (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      text: '[CORRECTED]\nActual answer only.',
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
    expect(chunks[0]).toBe('Actual answer only.');
    expect(chunks[0]).not.toContain('[CORRECTED]');
    expect(result.text).toBe('Actual answer only.');
  });

  it('falls back to original response when reflection ignores format (safety net against leakage)', async () => {
    const { generateText } = await import('ai');
    // LLM returned unformatted critique — no [CORRECTED] prefix, no [LGTM]
    (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      text: 'Your response was wrong because X. You should say Y instead.',
    });

    const messages: ModelMessage[] = [{ role: 'user', content: 'Hi' }];
    const chunks: string[] = [];

    const result = await runAgentTurn({
      messages,
      model: {} as any,
      reflectionLoops: 1,
      onChunk: (chunk) => chunks.push(chunk),
    });

    // Must NOT emit the critique text — fall back to original streamed response
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe('Hello, world!');
    expect(result.text).toBe('Hello, world!');
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

  it('applies sliding window when maxHistoryMessages is set', async () => {
    const { streamText } = await import('ai');
    (streamText as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: 'ok' };
      })(),
      response: Promise.resolve({ messages: [{ role: 'assistant', content: 'ok' }] }),
    });

    // 6 messages, window of 4 → only last 4 sent
    const messages: ModelMessage[] = [
      { role: 'user', content: 'msg1' },
      { role: 'assistant', content: 'resp1' },
      { role: 'user', content: 'msg2' },
      { role: 'assistant', content: 'resp2' },
      { role: 'user', content: 'msg3' },
      { role: 'assistant', content: 'resp3' },
    ];

    await runAgentTurn({ messages, model: {} as any, maxHistoryMessages: 4 });

    const sentMessages = (streamText as ReturnType<typeof vi.fn>).mock.calls[0][0].messages;
    expect(sentMessages).toHaveLength(4);
    expect(sentMessages[0].content).toBe('msg2');
    expect(sentMessages[3].content).toBe('resp3');
  });

  it('sends all messages when maxHistoryMessages is 0 (unlimited)', async () => {
    const { streamText } = await import('ai');
    (streamText as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: 'ok' };
      })(),
      response: Promise.resolve({ messages: [{ role: 'assistant', content: 'ok' }] }),
    });

    const messages: ModelMessage[] = [
      { role: 'user', content: 'msg1' },
      { role: 'assistant', content: 'resp1' },
      { role: 'user', content: 'msg2' },
    ];

    await runAgentTurn({ messages, model: {} as any, maxHistoryMessages: 0 });

    const sentMessages = (streamText as ReturnType<typeof vi.fn>).mock.calls[0][0].messages;
    expect(sentMessages).toHaveLength(3);
  });

  it('injects active skill stack into the system prompt', async () => {
    const { streamText } = await import('ai');
    (streamText as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: 'ok' };
      })(),
      response: Promise.resolve({ messages: [{ role: 'assistant', content: 'ok' }] }),
    });

    const { SkillStateManager } = await import('../../src/skills/state.js');
    const manager = new SkillStateManager(5);
    manager.push('jira-export', 'Skill workflow body.');

    const messages: ModelMessage[] = [{ role: 'user', content: 'do it' }];
    await runAgentTurn({
      messages,
      model: {} as any,
      skillManager: manager,
      systemPrompt: 'Base prompt.',
    });

    const sentSystem = (streamText as ReturnType<typeof vi.fn>).mock.calls[0][0].system as string;
    expect(sentSystem).toContain('Base prompt.');
    expect(sentSystem).toContain('ACTIVE SKILL: jira-export');
    expect(sentSystem).toContain('Skill workflow body.');
  });

  it('preserves full tool-result body in responseMessages even when context truncates', async () => {
    const { streamText } = await import('ai');
    const bigBody = 'x'.repeat(20000);

    (streamText as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      fullStream: (async function* () {
        yield { type: 'tool-call', toolName: 'api_call', input: { url: 'http://x' } };
        yield { type: 'tool-result', toolName: 'api_call', output: { body: bigBody } };
      })(),
      response: Promise.resolve({
        messages: [
          {
            role: 'assistant',
            content: [{ type: 'tool-call', toolCallId: 'id1', toolName: 'api_call', args: { url: 'http://x' } }],
          },
          {
            role: 'tool',
            content: [{ type: 'tool-result', toolCallId: 'id1', result: { body: bigBody } }],
          },
        ],
      }),
    });

    (streamText as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: 'done' };
      })(),
      response: Promise.resolve({ messages: [{ role: 'assistant', content: 'done' }] }),
    });

    const messages: ModelMessage[] = [{ role: 'user', content: 'fetch' }];
    const result = await runAgentTurn({ messages, model: {} as any });

    // The tool-result in responseMessages (what gets saved) must retain the full body.
    const toolMsg = result.responseMessages.find(
      (m) => m.role === 'tool' && Array.isArray(m.content),
    );
    expect(toolMsg).toBeDefined();
    const part = (toolMsg!.content as Array<Record<string, unknown>>)[0];
    const body = (part.result as { body: string }).body;
    expect(body.length).toBe(20000);
    expect(body).not.toContain('[truncated]');

    // The LLM context for step 2 should be truncated.
    const step2Messages = (streamText as ReturnType<typeof vi.fn>).mock.calls[1][0].messages as ModelMessage[];
    const truncatedTool = step2Messages.find(
      (m) => m.role === 'tool' && Array.isArray(m.content),
    );
    const truncatedBody = ((truncatedTool!.content as Array<Record<string, unknown>>)[0].result as { body: string }).body;
    expect(truncatedBody).toContain('[truncated]');
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
