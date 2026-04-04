import { describe, it, expect, afterEach } from 'vitest';
import { createDatabase, closeDatabase } from '../../src/session/db.js';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DB = join(import.meta.dirname, '__test_sessions.db');

afterEach(() => {
  closeDatabase();
  rmSync(TEST_DB, { force: true });
  rmSync(TEST_DB + '-journal', { force: true });
  rmSync(TEST_DB + '-wal', { force: true });
  rmSync(TEST_DB + '-shm', { force: true });
});

describe('createDatabase', () => {
  it('creates a new database with sessions table', () => {
    const db = createDatabase(TEST_DB);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
    ).all();
    expect(tables).toHaveLength(1);
  });

  it('is idempotent (can be called twice)', () => {
    createDatabase(TEST_DB);
    const db = createDatabase(TEST_DB);
    expect(db).toBeDefined();
  });
});
