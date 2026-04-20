import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionRepository } from '../../src/session/repository.js';
import { rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ModelMessage } from 'ai';

const TEST_DIR = join(import.meta.dirname, '__test_sessions__');
let repo: SessionRepository;

beforeEach(() => {
  repo = new SessionRepository(TEST_DIR);
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('SessionRepository (JSON)', () => {
  it('creates a new session with JSON file', () => {
    const session = repo.create('Test Session');
    expect(session.id).toBeDefined();
    expect(session.title).toBe('Test Session');
    expect(session.messages).toEqual([]);

    const filePath = join(TEST_DIR, `${session.id}.json`);
    expect(existsSync(filePath)).toBe(true);
  });

  it('creates index.json on first session', () => {
    repo.create('First');
    const indexPath = join(TEST_DIR, 'index.json');
    expect(existsSync(indexPath)).toBe(true);

    const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
    expect(index).toHaveLength(1);
    expect(index[0].title).toBe('First');
  });

  it('gets a session by id', () => {
    const created = repo.create('My Session');
    const found = repo.getById(created.id);
    expect(found).toBeDefined();
    expect(found!.title).toBe('My Session');
  });

  it('returns null for non-existent session', () => {
    const found = repo.getById('nonexistent-id');
    expect(found).toBeNull();
  });

  it('updates session messages', () => {
    const session = repo.create('Chat');
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
    ];
    repo.updateMessages(session.id, messages);

    const updated = repo.getById(session.id);
    expect(updated!.messages).toEqual(messages);
  });

  it('lists all sessions sorted by updatedAt desc', () => {
    repo.create('Session 1');
    repo.create('Session 2');
    const list = repo.list();
    expect(list).toHaveLength(2);
  });

  it('deletes a session and removes JSON file', () => {
    const session = repo.create('To Delete');
    const filePath = join(TEST_DIR, `${session.id}.json`);
    expect(existsSync(filePath)).toBe(true);

    repo.delete(session.id);
    expect(repo.getById(session.id)).toBeNull();
    expect(existsSync(filePath)).toBe(false);
  });

  it('appendMessages adds only new messages', () => {
    const session = repo.create('Append Test');
    const initial: ModelMessage[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ];
    repo.updateMessages(session.id, initial);

    const newMsgs: ModelMessage[] = [
      { role: 'user', content: 'question' },
      { role: 'assistant', content: 'answer' },
    ];
    repo.appendMessages(session.id, newMsgs);

    const loaded = repo.getById(session.id);
    expect(loaded!.messages).toHaveLength(4);
    expect(loaded!.messages[2]).toEqual({ role: 'user', content: 'question' });
    expect(loaded!.messages[3]).toEqual({ role: 'assistant', content: 'answer' });
  });

  it('appendMessages does nothing for empty array', () => {
    const session = repo.create('Empty Append');
    repo.updateMessages(session.id, [{ role: 'user', content: 'test' }]);
    repo.appendMessages(session.id, []);

    const loaded = repo.getById(session.id);
    expect(loaded!.messages).toHaveLength(1);
  });

  it('updates index.json when session is deleted', () => {
    const s1 = repo.create('Keep');
    const s2 = repo.create('Delete');
    repo.delete(s2.id);

    const index = JSON.parse(readFileSync(join(TEST_DIR, 'index.json'), 'utf-8'));
    expect(index).toHaveLength(1);
    expect(index[0].id).toBe(s1.id);
  });

  it('stores messages in a separate .messages.jsonl file', () => {
    const session = repo.create('Jsonl Test');
    repo.updateMessages(session.id, [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ]);

    const jsonlPath = join(TEST_DIR, `${session.id}.messages.jsonl`);
    expect(existsSync(jsonlPath)).toBe(true);

    const lines = readFileSync(jsonlPath, 'utf-8').split('\n').filter((l) => l.length > 0);
    expect(lines).toHaveLength(2);

    // Metadata file no longer carries full messages inline.
    const meta = JSON.parse(readFileSync(join(TEST_DIR, `${session.id}.json`), 'utf-8'));
    expect(meta.messages).toBeUndefined();
  });

  it('preserves large tool-result bodies through append/read roundtrip', () => {
    const session = repo.create('Large Body');
    const bigBody = 'x'.repeat(20000);
    const msg: ModelMessage = {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 't1',
          toolName: 'api_call',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          result: { body: bigBody } as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          output: { body: bigBody } as any,
        },
      ],
    };
    repo.appendMessages(session.id, [msg]);

    const loaded = repo.getById(session.id);
    expect(loaded!.messages).toHaveLength(1);
    const loadedMsg = loaded!.messages[0];
    expect(Array.isArray(loadedMsg.content)).toBe(true);
    const part = (loadedMsg.content as Array<Record<string, unknown>>)[0];
    expect((part.result as { body: string }).body.length).toBe(20000);
  });

  it('persists and restores activeSkillNames', () => {
    const session = repo.create('With Skills');
    repo.updateActiveSkills(session.id, ['parent', 'child']);

    const loaded = repo.getById(session.id);
    expect(loaded?.activeSkillNames).toEqual(['parent', 'child']);

    repo.updateActiveSkills(session.id, []);
    const cleared = repo.getById(session.id);
    expect(cleared?.activeSkillNames).toBeUndefined();
  });

  it('updateActiveSkills bumps updatedAt so the index can re-sort', () => {
    const session = repo.create('Bump Test');
    const before = session.updatedAt;
    // force a clock tick
    const now = Date.now();
    while (Date.now() === now) { /* spin */ }
    repo.updateActiveSkills(session.id, ['x']);
    const loaded = repo.getById(session.id);
    expect(loaded!.updatedAt > before).toBe(true);
  });

  it('migrates legacy in-meta messages on first append', () => {
    const session = repo.create('Legacy Migrate');
    // Simulate a legacy session file: messages embedded in meta
    const legacyMeta = {
      id: session.id,
      title: 'Legacy Migrate',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [{ role: 'user', content: 'old' }],
    };
    const metaPath = join(TEST_DIR, `${session.id}.json`);
    // Remove new-format artifacts so we can test the legacy path cleanly.
    rmSync(join(TEST_DIR, `${session.id}.messages.jsonl`), { force: true });
    writeFileSync(metaPath, JSON.stringify(legacyMeta), 'utf-8');

    repo.appendMessages(session.id, [{ role: 'assistant', content: 'new' }]);

    const loaded = repo.getById(session.id);
    expect(loaded!.messages).toHaveLength(2);
    expect(loaded!.messages[0]).toEqual({ role: 'user', content: 'old' });
    expect(loaded!.messages[1]).toEqual({ role: 'assistant', content: 'new' });
  });
});
