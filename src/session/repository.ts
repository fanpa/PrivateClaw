import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Session } from './types.js';
import type { ModelMessage } from 'ai';

interface IndexEntry {
  id: string;
  title: string;
  updatedAt: string;
}

export class SessionRepository {
  private readonly dir: string;
  private readonly indexPath: string;

  constructor(sessionDir: string) {
    this.dir = sessionDir;
    this.indexPath = join(sessionDir, 'index.json');
    mkdirSync(sessionDir, { recursive: true });
  }

  private readIndex(): IndexEntry[] {
    if (!existsSync(this.indexPath)) return [];
    return JSON.parse(readFileSync(this.indexPath, 'utf-8')) as IndexEntry[];
  }

  private writeIndex(entries: IndexEntry[]): void {
    writeFileSync(this.indexPath, JSON.stringify(entries, null, 2) + '\n', 'utf-8');
  }

  private sessionPath(id: string): string {
    return join(this.dir, `${id}.json`);
  }

  create(title: string): Session {
    const id = randomUUID();
    const now = new Date().toISOString();
    const session: Session = {
      id,
      title,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };

    writeFileSync(this.sessionPath(id), JSON.stringify(session, null, 2) + '\n', 'utf-8');

    const index = this.readIndex();
    index.push({ id, title, updatedAt: now });
    this.writeIndex(index);

    return session;
  }

  getById(id: string): Session | null {
    const path = this.sessionPath(id);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf-8')) as Session;
  }

  list(): Session[] {
    const index = this.readIndex();
    index.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return index.map((entry) => this.getById(entry.id)).filter((s): s is Session => s !== null);
  }

  updateMessages(id: string, messages: ModelMessage[]): void {
    const session = this.getById(id);
    if (!session) return;

    session.messages = messages;
    session.updatedAt = new Date().toISOString();
    writeFileSync(this.sessionPath(id), JSON.stringify(session, null, 2) + '\n', 'utf-8');

    const index = this.readIndex();
    const entry = index.find((e) => e.id === id);
    if (entry) {
      entry.updatedAt = session.updatedAt;
      this.writeIndex(index);
    }
  }

  appendMessages(id: string, newMessages: ModelMessage[]): void {
    if (newMessages.length === 0) return;

    const session = this.getById(id);
    if (!session) return;

    session.messages.push(...newMessages);
    session.updatedAt = new Date().toISOString();
    writeFileSync(this.sessionPath(id), JSON.stringify(session, null, 2) + '\n', 'utf-8');

    const index = this.readIndex();
    const entry = index.find((e) => e.id === id);
    if (entry) {
      entry.updatedAt = session.updatedAt;
      this.writeIndex(index);
    }
  }

  delete(id: string): void {
    const path = this.sessionPath(id);
    if (existsSync(path)) rmSync(path);

    const index = this.readIndex().filter((e) => e.id !== id);
    this.writeIndex(index);
  }
}
