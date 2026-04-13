import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolApprovalManager } from '../../src/approval/manager.js';
import { createApprovalHandler } from '../../src/cli/chat.js';
import type { Interface as ReadlineInterface } from 'node:readline';

vi.mock('../../src/cli/renderer.js', () => ({
  renderApprovalPrompt: vi.fn(),
  renderApprovalResult: vi.fn(),
}));

function makeMockRl() {
  return {
    question: vi.fn(),
  } as unknown as ReadlineInterface;
}

describe('createApprovalHandler', () => {
  let manager: ToolApprovalManager;
  let rl: ReadlineInterface;

  beforeEach(() => {
    manager = new ToolApprovalManager();
    rl = makeMockRl();
  });

  it('prompts on first call and returns allow_always when user answers a', async () => {
    const { handler } = createApprovalHandler(rl, manager);

    (rl.question as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_prompt: string, cb: (ans: string) => void) => cb('a'),
    );

    const decision = await handler('file_read', { filePath: '/tmp/x' });

    expect(decision).toBe('allow_always');
    expect(rl.question).toHaveBeenCalledTimes(1);
  });

  it('skips prompt on second call after allow_always and auto-approves', async () => {
    const { handler } = createApprovalHandler(rl, manager);

    (rl.question as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_prompt: string, cb: (ans: string) => void) => cb('a'),
    );
    await handler('file_read', { filePath: '/tmp/x' });

    const second = await handler('file_read', { filePath: '/tmp/y' });

    expect(rl.question).toHaveBeenCalledTimes(1);
    expect(second).toBe('allow_once');
  });

  it('prompts again on second call after allow_once', async () => {
    const { handler } = createApprovalHandler(rl, manager);

    (rl.question as ReturnType<typeof vi.fn>)
      .mockImplementationOnce((_: string, cb: (ans: string) => void) => cb('y'))
      .mockImplementationOnce((_: string, cb: (ans: string) => void) => cb('y'));

    await handler('file_read', { filePath: '/tmp/x' });
    await handler('file_read', { filePath: '/tmp/y' });

    expect(rl.question).toHaveBeenCalledTimes(2);
  });

  it('allow_always for use_skill:yield-report does not skip prompt for use_skill:email', async () => {
    const { handler } = createApprovalHandler(rl, manager);

    (rl.question as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_: string, cb: (ans: string) => void) => cb('a'),
    );
    await handler('use_skill', { name: 'yield-report' });

    (rl.question as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_: string, cb: (ans: string) => void) => cb('y'),
    );
    const second = await handler('use_skill', { name: 'email' });

    expect(rl.question).toHaveBeenCalledTimes(2);
    expect(second).toBe('allow_once');
  });

  it('allow_always for use_skill:yield-report auto-approves second call for same skill', async () => {
    const { handler } = createApprovalHandler(rl, manager);

    (rl.question as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_: string, cb: (ans: string) => void) => cb('a'),
    );
    await handler('use_skill', { name: 'yield-report' });

    const second = await handler('use_skill', { name: 'yield-report' });

    expect(rl.question).toHaveBeenCalledTimes(1);
    expect(second).toBe('allow_once');
  });

  it('willPrompt returns true for pending tools', () => {
    const { willPrompt } = createApprovalHandler(rl, manager);
    expect(willPrompt('file_read', {})).toBe(true);
  });

  it('willPrompt returns false after allow_always', async () => {
    const { handler, willPrompt } = createApprovalHandler(rl, manager);

    (rl.question as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_: string, cb: (ans: string) => void) => cb('a'),
    );
    await handler('file_read', {});

    expect(willPrompt('file_read', {})).toBe(false);
  });
});
