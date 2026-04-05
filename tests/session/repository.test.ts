import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, closeDatabase } from '../../src/session/db.js';
import { SessionRepository } from '../../src/session/repository.js';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { CoreMessage } from 'ai';

const TEST_DB = join(import.meta.dirname, '__test_repo.db');
let repo: SessionRepository;

beforeEach(() => {
  createDatabase(TEST_DB);
  repo = new SessionRepository();
});

afterEach(() => {
  closeDatabase();
  rmSync(TEST_DB, { force: true });
  rmSync(TEST_DB + '-journal', { force: true });
  rmSync(TEST_DB + '-wal', { force: true });
  rmSync(TEST_DB + '-shm', { force: true });
});

describe('SessionRepository', () => {
  it('creates a new session', () => {
    const session = repo.create('Test Session');
    expect(session.id).toBeDefined();
    expect(session.title).toBe('Test Session');
    expect(session.messages).toEqual([]);
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
    const messages: CoreMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
    ];
    repo.updateMessages(session.id, messages);

    const updated = repo.getById(session.id);
    expect(updated!.messages).toEqual(messages);
  });

  it('lists all sessions', () => {
    repo.create('Session 1');
    repo.create('Session 2');
    const list = repo.list();
    expect(list).toHaveLength(2);
  });

  it('deletes a session', () => {
    const session = repo.create('To Delete');
    repo.delete(session.id);
    expect(repo.getById(session.id)).toBeNull();
  });
});
