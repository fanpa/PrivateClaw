import { randomUUID } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import type { Session } from './types.js';
import type { ModelMessage } from 'ai';

interface IndexEntry {
  id: string;
  title: string;
  updatedAt: string;
}

interface SessionMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface MetaFileState {
  meta: SessionMeta;
  legacyMessages: ModelMessage[] | null;
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

  private metaPath(id: string): string {
    return join(this.dir, `${id}.json`);
  }

  private messagesPath(id: string): string {
    return join(this.dir, `${id}.messages.jsonl`);
  }

  private readMetaFile(id: string): MetaFileState | null {
    const path = this.metaPath(id);
    if (!existsSync(path)) return null;
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
    const meta: SessionMeta = {
      id: String(raw.id),
      title: String(raw.title),
      createdAt: String(raw.createdAt),
      updatedAt: String(raw.updatedAt),
    };
    const legacyMessages = Array.isArray(raw.messages) ? (raw.messages as ModelMessage[]) : null;
    return { meta, legacyMessages };
  }

  private writeMetaFile(meta: SessionMeta): void {
    writeFileSync(this.metaPath(meta.id), JSON.stringify(meta, null, 2) + '\n', 'utf-8');
  }

  private readJsonlMessages(id: string): ModelMessage[] {
    const path = this.messagesPath(id);
    if (!existsSync(path)) return [];
    const content = readFileSync(path, 'utf-8');
    if (content.length === 0) return [];
    const lines = content.split('\n').filter((l) => l.length > 0);
    return lines.map((l) => JSON.parse(l) as ModelMessage);
  }

  private writeJsonlMessages(id: string, messages: ModelMessage[]): void {
    const serialized = messages.length > 0
      ? messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
      : '';
    writeFileSync(this.messagesPath(id), serialized, 'utf-8');
  }

  private updateIndexTimestamp(id: string, updatedAt: string): void {
    const index = this.readIndex();
    const entry = index.find((e) => e.id === id);
    if (entry) {
      entry.updatedAt = updatedAt;
      this.writeIndex(index);
    }
  }

  create(title: string): Session {
    const id = randomUUID();
    const now = new Date().toISOString();
    const meta: SessionMeta = { id, title, createdAt: now, updatedAt: now };

    this.writeMetaFile(meta);
    this.writeJsonlMessages(id, []);

    const index = this.readIndex();
    index.push({ id, title, updatedAt: now });
    this.writeIndex(index);

    return { ...meta, messages: [] };
  }

  getById(id: string): Session | null {
    const state = this.readMetaFile(id);
    if (!state) return null;
    const messages = state.legacyMessages ?? this.readJsonlMessages(id);
    return { ...state.meta, messages };
  }

  list(): Session[] {
    const index = this.readIndex();
    index.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return index.map((entry) => this.getById(entry.id)).filter((s): s is Session => s !== null);
  }

  updateMessages(id: string, messages: ModelMessage[]): void {
    const state = this.readMetaFile(id);
    if (!state) return;

    const updatedAt = new Date().toISOString();
    const meta: SessionMeta = { ...state.meta, updatedAt };
    this.writeMetaFile(meta);
    this.writeJsonlMessages(id, messages);
    this.updateIndexTimestamp(id, updatedAt);
  }

  appendMessages(id: string, newMessages: ModelMessage[]): void {
    if (newMessages.length === 0) return;

    const state = this.readMetaFile(id);
    if (!state) return;

    // Migrate legacy format on first append: materialise jsonl from embedded messages.
    if (state.legacyMessages !== null) {
      this.writeJsonlMessages(id, [...state.legacyMessages, ...newMessages]);
    } else {
      const blob = newMessages.map((m) => JSON.stringify(m)).join('\n') + '\n';
      appendFileSync(this.messagesPath(id), blob, 'utf-8');
    }

    const updatedAt = new Date().toISOString();
    this.writeMetaFile({ ...state.meta, updatedAt });
    this.updateIndexTimestamp(id, updatedAt);
  }

  delete(id: string): void {
    const meta = this.metaPath(id);
    const msgs = this.messagesPath(id);
    if (existsSync(meta)) rmSync(meta);
    if (existsSync(msgs)) rmSync(msgs);

    const index = this.readIndex().filter((e) => e.id !== id);
    this.writeIndex(index);
  }
}
