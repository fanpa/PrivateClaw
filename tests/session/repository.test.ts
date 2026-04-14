import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionRepository } from '../../src/session/repository.js';
import { rmSync, existsSync, readFileSync } from 'node:fs';
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
});
