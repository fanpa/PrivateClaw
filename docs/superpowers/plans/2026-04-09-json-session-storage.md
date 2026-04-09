# JSON Session Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `better-sqlite3` with JSON file-based session storage to eliminate native module dependency and enable standalone binary distribution.

**Architecture:** Each session is stored as a separate JSON file (`{sessionDir}/{id}.json`). An `index.json` file maintains the session list (id, title, updatedAt). `SessionRepository` API stays the same — only the storage backend changes. Config `session.dbPath` becomes `session.sessionDir`.

**Tech Stack:** TypeScript, Node.js fs, Vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/session/repository.ts` | Rewrite | JSON file-based CRUD operations |
| `src/session/db.ts` | Delete | No longer needed (was SQLite init) |
| `src/config/schema.ts` | Modify | `dbPath` → `sessionDir` |
| `src/cli/app.ts` | Modify | Remove `createDatabase`/`closeDatabase`, pass `sessionDir` |
| `src/cli/chat.ts` | Modify | Pass `sessionDir` to `SessionRepository` constructor |
| `src/index.ts` | Modify | Remove db exports |
| `tests/session/repository.test.ts` | Rewrite | Test JSON-based repository |
| `tests/session/db.test.ts` | Delete | No longer needed |
| `package.json` | Modify | Remove `better-sqlite3` dependency |

---

### Task 1: Rewrite SessionRepository to JSON files

**Files:**
- Rewrite: `src/session/repository.ts`
- Rewrite: `tests/session/repository.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/session/repository.test.ts
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

  it('updates index.json when session is deleted', () => {
    const s1 = repo.create('Keep');
    const s2 = repo.create('Delete');
    repo.delete(s2.id);

    const index = JSON.parse(readFileSync(join(TEST_DIR, 'index.json'), 'utf-8'));
    expect(index).toHaveLength(1);
    expect(index[0].id).toBe(s1.id);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/taeji/Workspace/github/PrivateClaw && npx vitest run tests/session/repository.test.ts`
Expected: FAIL — constructor signature mismatch or import errors

- [ ] **Step 3: Implement JSON-based SessionRepository**

```typescript
// src/session/repository.ts
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
    return index.map((entry) => {
      const session = this.getById(entry.id);
      return session!;
    }).filter(Boolean);
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

  delete(id: string): void {
    const path = this.sessionPath(id);
    if (existsSync(path)) rmSync(path);

    const index = this.readIndex().filter((e) => e.id !== id);
    this.writeIndex(index);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/taeji/Workspace/github/PrivateClaw && npx vitest run tests/session/repository.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/session/repository.ts tests/session/repository.test.ts
git commit -m "refactor(session): replace SQLite with JSON file-based storage"
```

---

### Task 2: Remove SQLite dependencies and update config

**Files:**
- Delete: `src/session/db.ts`
- Delete: `tests/session/db.test.ts`
- Modify: `src/config/schema.ts`
- Modify: `src/index.ts`
- Modify: `package.json`

- [ ] **Step 1: Update config schema — `dbPath` → `sessionDir`**

In `src/config/schema.ts`, change:

```typescript
const SessionSchema = z.object({
  sessionDir: z.string().default('./.privateclaw/sessions'),
  maxHistoryMessages: z.number().int().min(0).default(20),
});
```

- [ ] **Step 2: Delete db.ts and db.test.ts**

```bash
rm src/session/db.ts tests/session/db.test.ts
```

- [ ] **Step 3: Update src/index.ts — remove db exports**

Remove the line:
```typescript
export { createDatabase, closeDatabase } from './session/db.js';
```

- [ ] **Step 4: Remove better-sqlite3 from package.json**

```bash
pnpm remove better-sqlite3 @types/better-sqlite3
```

- [ ] **Step 5: Run tests (expect some failures in app.ts/chat.ts — fixed in Task 3)**

Run: `cd /Users/taeji/Workspace/github/PrivateClaw && npx vitest run tests/session/repository.test.ts`
Expected: PASS (repository tests should still work)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(config): remove better-sqlite3, change dbPath to sessionDir"
```

---

### Task 3: Update CLI to use JSON sessions

**Files:**
- Modify: `src/cli/app.ts`
- Modify: `src/cli/chat.ts`

- [ ] **Step 1: Update app.ts**

Remove imports of `createDatabase`/`closeDatabase`. Pass `sessionDir` instead of `dbPath`:

- `chat` command: Remove `createDatabase(config.session.dbPath)` and `closeDatabase()`. Pass `sessionDir: config.session.sessionDir` in options.
- `sessions` command: Create `new SessionRepository(config.session.sessionDir)` directly.
- Remove all `finally { closeDatabase() }` blocks.

- [ ] **Step 2: Update chat.ts**

Add `sessionDir` to `ChatOptions`. Change `SessionRepository` constructor to accept `sessionDir`:

```typescript
const repo = new SessionRepository(currentOptions.sessionDir ?? './.privateclaw/sessions');
```

Also update `/reload` to pick up `sessionDir`.

- [ ] **Step 3: Run full test suite**

Run: `cd /Users/taeji/Workspace/github/PrivateClaw && npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/cli/app.ts src/cli/chat.ts
git commit -m "refactor(cli): wire sessionDir through app and chat"
```

---

### Task 4: Update config example and README

**Files:**
- Modify: `privateclaw.config.example.json`
- Modify: `README.md`

- [ ] **Step 1: Update example config**

Change `session` field:

```json
{
  "session": {
    "sessionDir": "./.privateclaw/sessions",
    "maxHistoryMessages": 20
  }
}
```

- [ ] **Step 2: Update README**

- Replace all `dbPath` references with `sessionDir`
- Update "대화 기록 관리" section to mention JSON file-based storage
- Add `.privateclaw/` to the suggested `.gitignore` entries

- [ ] **Step 3: Add .privateclaw to .gitignore**

```bash
echo ".privateclaw/" >> .gitignore
```

- [ ] **Step 4: Commit**

```bash
git add privateclaw.config.example.json README.md .gitignore
git commit -m "docs: update config and README for JSON session storage"
```
