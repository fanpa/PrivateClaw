import { randomUUID } from 'node:crypto';
import { getDatabase } from './db.js';
import type { Session } from './types.js';
import type { CoreMessage } from 'ai';

interface SessionRow {
  id: string;
  title: string;
  messages: string;
  created_at: string;
  updated_at: string;
}

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    title: row.title,
    messages: JSON.parse(row.messages) as CoreMessage[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SessionRepository {
  create(title: string): Session {
    const db = getDatabase();
    const id = randomUUID();
    db.prepare(
      'INSERT INTO sessions (id, title) VALUES (?, ?)'
    ).run(id, title);
    return this.getById(id)!;
  }

  getById(id: string): Session | null {
    const db = getDatabase();
    const row = db.prepare(
      'SELECT * FROM sessions WHERE id = ?'
    ).get(id) as SessionRow | undefined;
    return row ? rowToSession(row) : null;
  }

  list(): Session[] {
    const db = getDatabase();
    const rows = db.prepare(
      'SELECT * FROM sessions ORDER BY updated_at DESC'
    ).all() as SessionRow[];
    return rows.map(rowToSession);
  }

  updateMessages(id: string, messages: CoreMessage[]): void {
    const db = getDatabase();
    db.prepare(
      "UPDATE sessions SET messages = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(JSON.stringify(messages), id);
  }

  delete(id: string): void {
    const db = getDatabase();
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  }
}
