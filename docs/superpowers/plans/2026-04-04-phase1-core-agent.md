# Phase 1: Core Agent MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LLM 엔드포인트를 연결하면 CLI에서 대화하고, 파일 읽기/쓰기/Bash 실행이 가능한 AI 에이전트를 만든다.

**Architecture:** CLI가 에이전트 루프를 구동하고, 에이전트 루프는 Vercel AI SDK를 통해 LLM과 통신하며 Tool을 호출한다. 설정 파일로 프로바이더와 허용 도메인을 관리하고, SQLite로 세션을 저장한다. 도메인 화이트리스트는 Node.js의 HTTP agent를 래핑하여 네트워크 레벨에서 차단한다.

**Tech Stack:** TypeScript, Node.js, pnpm, Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `ollama-ai-provider`), Commander.js, better-sqlite3, Zod, Vitest

---

## File Structure

```
privateclaw/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
├── tsconfig.build.json
├── vitest.config.ts
├── .eslintrc.cjs
├── .gitignore
├── bin/
│   └── privateclaw.ts              # CLI 엔트리포인트 (Commander.js)
├── src/
│   ├── index.ts                     # 패키지 public export
│   ├── config/
│   │   ├── schema.ts                # Zod 설정 스키마 정의
│   │   └── loader.ts                # 설정 파일 로드/검증
│   ├── provider/
│   │   ├── registry.ts              # 프로바이더 팩토리 레지스트리
│   │   └── create.ts                # 설정 기반 프로바이더 인스턴스 생성
│   ├── security/
│   │   ├── domain-guard.ts          # 도메인 화이트리스트 HTTP agent
│   │   └── restricted-fetch.ts      # 제한된 fetch 래퍼
│   ├── tools/
│   │   ├── registry.ts              # Tool 레지스트리
│   │   ├── file-read.ts             # 파일 읽기 도구
│   │   ├── file-write.ts            # 파일 쓰기 도구
│   │   └── bash-exec.ts             # Bash 실행 도구
│   ├── agent/
│   │   ├── loop.ts                  # 에이전트 루프 (streamText + maxSteps)
│   │   └── types.ts                 # 에이전트 관련 타입 정의
│   ├── session/
│   │   ├── db.ts                    # SQLite 연결 및 마이그레이션
│   │   ├── repository.ts            # 세션 CRUD
│   │   └── types.ts                 # 세션 타입 정의
│   └── cli/
│       ├── app.ts                   # CLI 앱 (Commander.js 명령 정의)
│       ├── chat.ts                  # 대화형 REPL 루프
│       └── renderer.ts             # 스트리밍 출력 렌더링
├── tests/
│   ├── config/
│   │   ├── schema.test.ts
│   │   └── loader.test.ts
│   ├── provider/
│   │   └── registry.test.ts
│   ├── security/
│   │   ├── domain-guard.test.ts
│   │   └── restricted-fetch.test.ts
│   ├── tools/
│   │   ├── file-read.test.ts
│   │   ├── file-write.test.ts
│   │   └── bash-exec.test.ts
│   ├── agent/
│   │   └── loop.test.ts
│   └── session/
│       ├── db.test.ts
│       └── repository.test.ts
└── privateclaw.config.example.json  # 설정 파일 예시
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.build.json`
- Create: `vitest.config.ts`
- Create: `.eslintrc.cjs`
- Create: `.gitignore`

- [ ] **Step 1: Initialize pnpm project**

```bash
cd /Users/taeji/Workspace/github/PrivateClaw
pnpm init
```

- [ ] **Step 2: Install core dependencies**

```bash
pnpm add ai @ai-sdk/openai @ai-sdk/anthropic ollama-ai-provider zod better-sqlite3 commander chalk ora readline
pnpm add -D typescript @types/node @types/better-sqlite3 vitest @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint tsx
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*", "bin/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create tsconfig.build.json**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "."
  },
  "include": ["src/**/*", "bin/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 5: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
    },
  },
});
```

- [ ] **Step 6: Create .eslintrc.cjs**

```javascript
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
};
```

- [ ] **Step 7: Create .gitignore**

```
node_modules/
dist/
*.db
*.db-journal
.env
privateclaw.config.json
coverage/
```

- [ ] **Step 8: Update package.json scripts and type**

`package.json`의 scripts와 type 필드를 다음과 같이 설정:

```json
{
  "type": "module",
  "bin": {
    "privateclaw": "./bin/privateclaw.ts"
  },
  "scripts": {
    "dev": "tsx bin/privateclaw.ts",
    "build": "tsc -p tsconfig.build.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/ tests/ bin/"
  }
}
```

- [ ] **Step 9: Create directory structure**

```bash
mkdir -p src/{config,provider,security,tools,agent,session,cli} tests/{config,provider,security,tools,agent,session} bin
```

- [ ] **Step 10: Verify setup**

```bash
pnpm test
pnpm lint
```

Expected: 테스트 0개 통과 (테스트 파일 없음), lint 통과.

- [ ] **Step 11: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json tsconfig.build.json vitest.config.ts .eslintrc.cjs .gitignore
git commit -m "chore: initialize project with TypeScript, Vitest, ESLint"
```

---

### Task 2: Config Schema and Loader

**Files:**
- Create: `src/config/schema.ts`
- Create: `src/config/loader.ts`
- Test: `tests/config/schema.test.ts`
- Test: `tests/config/loader.test.ts`
- Create: `privateclaw.config.example.json`

- [ ] **Step 1: Write failing tests for config schema**

`tests/config/schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ConfigSchema } from '../../src/config/schema.js';

describe('ConfigSchema', () => {
  it('validates a minimal valid config', () => {
    const config = {
      provider: {
        type: 'openai',
        baseURL: 'http://localhost:8080/v1',
        apiKey: 'test-key',
        model: 'gpt-4o',
      },
    };
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('validates config with all fields', () => {
    const config = {
      provider: {
        type: 'openai',
        baseURL: 'http://localhost:8080/v1',
        apiKey: 'test-key',
        model: 'gpt-4o',
      },
      security: {
        allowedDomains: ['localhost', 'internal.corp.com'],
      },
      session: {
        dbPath: './data/sessions.db',
      },
    };
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('rejects config without provider', () => {
    const result = ConfigSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects config with unknown provider type', () => {
    const config = {
      provider: {
        type: 'unknown-provider',
        baseURL: 'http://localhost:8080/v1',
        model: 'test',
      },
    };
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('defaults security.allowedDomains to empty array', () => {
    const config = {
      provider: {
        type: 'ollama',
        baseURL: 'http://localhost:11434/api',
        model: 'llama3.2',
      },
    };
    const result = ConfigSchema.parse(config);
    expect(result.security.allowedDomains).toEqual([]);
  });

  it('defaults session.dbPath', () => {
    const config = {
      provider: {
        type: 'ollama',
        baseURL: 'http://localhost:11434/api',
        model: 'llama3.2',
      },
    };
    const result = ConfigSchema.parse(config);
    expect(result.session.dbPath).toBe('./privateclaw-sessions.db');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- tests/config/schema.test.ts
```

Expected: FAIL — `Cannot find module '../../src/config/schema.js'`

- [ ] **Step 3: Implement config schema**

`src/config/schema.ts`:

```typescript
import { z } from 'zod';

const ProviderSchema = z.object({
  type: z.enum(['openai', 'anthropic', 'ollama']),
  baseURL: z.string().url(),
  apiKey: z.string().optional(),
  model: z.string(),
});

const SecuritySchema = z.object({
  allowedDomains: z.array(z.string()).default([]),
});

const SessionSchema = z.object({
  dbPath: z.string().default('./privateclaw-sessions.db'),
});

export const ConfigSchema = z.object({
  provider: ProviderSchema,
  security: SecuritySchema.default({}),
  session: SessionSchema.default({}),
});

export type Config = z.infer<typeof ConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderSchema>;
export type SecurityConfig = z.infer<typeof SecuritySchema>;
export type SessionConfig = z.infer<typeof SessionSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- tests/config/schema.test.ts
```

Expected: 6 tests PASS

- [ ] **Step 5: Write failing tests for config loader**

`tests/config/loader.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../../src/config/loader.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = join(import.meta.dirname, '__fixtures__');

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('loads a valid config file', () => {
    const configPath = join(TEST_DIR, 'valid.json');
    writeFileSync(configPath, JSON.stringify({
      provider: {
        type: 'openai',
        baseURL: 'http://localhost:8080/v1',
        apiKey: 'test-key',
        model: 'gpt-4o',
      },
    }));

    const config = loadConfig(configPath);
    expect(config.provider.type).toBe('openai');
    expect(config.provider.model).toBe('gpt-4o');
  });

  it('throws on missing config file', () => {
    expect(() => loadConfig('/nonexistent/path.json')).toThrow();
  });

  it('throws on invalid JSON', () => {
    const configPath = join(TEST_DIR, 'invalid.json');
    writeFileSync(configPath, '{ not valid json }');
    expect(() => loadConfig(configPath)).toThrow();
  });

  it('throws on invalid schema', () => {
    const configPath = join(TEST_DIR, 'bad-schema.json');
    writeFileSync(configPath, JSON.stringify({ provider: { type: 'invalid' } }));
    expect(() => loadConfig(configPath)).toThrow();
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

```bash
pnpm test -- tests/config/loader.test.ts
```

Expected: FAIL — `Cannot find module '../../src/config/loader.js'`

- [ ] **Step 7: Implement config loader**

`src/config/loader.ts`:

```typescript
import { readFileSync } from 'node:fs';
import { ConfigSchema, type Config } from './schema.js';

export function loadConfig(filePath: string): Config {
  const raw = readFileSync(filePath, 'utf-8');
  const json = JSON.parse(raw);
  return ConfigSchema.parse(json);
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
pnpm test -- tests/config/
```

Expected: 10 tests PASS

- [ ] **Step 9: Create example config file**

`privateclaw.config.example.json`:

```json
{
  "provider": {
    "type": "openai",
    "baseURL": "http://localhost:8080/v1",
    "apiKey": "your-api-key",
    "model": "gpt-4o"
  },
  "security": {
    "allowedDomains": ["localhost", "internal.corp.com"]
  },
  "session": {
    "dbPath": "./privateclaw-sessions.db"
  }
}
```

- [ ] **Step 10: Commit**

```bash
git add src/config/ tests/config/ privateclaw.config.example.json
git commit -m "feat: add config schema and loader with Zod validation"
```

---

### Task 3: Provider Registry

**Files:**
- Create: `src/provider/registry.ts`
- Create: `src/provider/create.ts`
- Test: `tests/provider/registry.test.ts`

- [ ] **Step 1: Write failing tests for provider registry**

`tests/provider/registry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createProvider } from '../../src/provider/create.js';
import type { ProviderConfig } from '../../src/config/schema.js';

describe('createProvider', () => {
  it('creates an OpenAI provider with custom baseURL', () => {
    const config: ProviderConfig = {
      type: 'openai',
      baseURL: 'http://internal-llm:8080/v1',
      apiKey: 'test-key',
      model: 'gpt-4o',
    };
    const { model, provider } = createProvider(config);
    expect(model).toBeDefined();
    expect(provider).toBe('openai');
  });

  it('creates an Anthropic provider with custom baseURL', () => {
    const config: ProviderConfig = {
      type: 'anthropic',
      baseURL: 'http://internal-llm:8081/v1',
      apiKey: 'test-key',
      model: 'claude-sonnet-4-20250514',
    };
    const { model, provider } = createProvider(config);
    expect(model).toBeDefined();
    expect(provider).toBe('anthropic');
  });

  it('creates an Ollama provider with custom baseURL', () => {
    const config: ProviderConfig = {
      type: 'ollama',
      baseURL: 'http://localhost:11434/api',
      model: 'llama3.2',
    };
    const { model, provider } = createProvider(config);
    expect(model).toBeDefined();
    expect(provider).toBe('ollama');
  });

  it('throws on unsupported provider type', () => {
    const config = {
      type: 'unsupported' as 'openai',
      baseURL: 'http://localhost:8080/v1',
      model: 'test',
    };
    expect(() => createProvider(config)).toThrow('Unsupported provider');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- tests/provider/registry.test.ts
```

Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Implement provider create**

`src/provider/create.ts`:

```typescript
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOllama } from 'ollama-ai-provider';
import type { LanguageModelV1 } from 'ai';
import type { ProviderConfig } from '../config/schema.js';

export interface ProviderResult {
  model: LanguageModelV1;
  provider: string;
}

export function createProvider(config: ProviderConfig): ProviderResult {
  switch (config.type) {
    case 'openai': {
      const openai = createOpenAI({
        baseURL: config.baseURL,
        apiKey: config.apiKey ?? '',
      });
      return { model: openai(config.model), provider: 'openai' };
    }
    case 'anthropic': {
      const anthropic = createAnthropic({
        baseURL: config.baseURL,
        apiKey: config.apiKey ?? '',
      });
      return { model: anthropic(config.model), provider: 'anthropic' };
    }
    case 'ollama': {
      const ollama = createOllama({
        baseURL: config.baseURL,
      });
      return { model: ollama(config.model), provider: 'ollama' };
    }
    default:
      throw new Error(`Unsupported provider: ${(config as ProviderConfig).type}`);
  }
}
```

- [ ] **Step 4: Implement provider registry**

`src/provider/registry.ts`:

```typescript
import type { LanguageModelV1 } from 'ai';
import { createProvider } from './create.js';
import type { ProviderConfig } from '../config/schema.js';

let currentModel: LanguageModelV1 | null = null;
let currentProviderName: string | null = null;

export function initProvider(config: ProviderConfig): void {
  const { model, provider } = createProvider(config);
  currentModel = model;
  currentProviderName = provider;
}

export function getModel(): LanguageModelV1 {
  if (!currentModel) {
    throw new Error('Provider not initialized. Call initProvider() first.');
  }
  return currentModel;
}

export function getProviderName(): string {
  if (!currentProviderName) {
    throw new Error('Provider not initialized. Call initProvider() first.');
  }
  return currentProviderName;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test -- tests/provider/
```

Expected: 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/provider/ tests/provider/
git commit -m "feat: add multi-provider registry (OpenAI, Anthropic, Ollama)"
```

---

### Task 4: Domain Whitelist Security

**Files:**
- Create: `src/security/domain-guard.ts`
- Create: `src/security/restricted-fetch.ts`
- Test: `tests/security/domain-guard.test.ts`
- Test: `tests/security/restricted-fetch.test.ts`

- [ ] **Step 1: Write failing tests for domain guard**

`tests/security/domain-guard.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { isDomainAllowed } from '../../src/security/domain-guard.js';

describe('isDomainAllowed', () => {
  const allowed = ['localhost', 'internal.corp.com', '192.168.1.100'];

  it('allows a whitelisted domain', () => {
    expect(isDomainAllowed('internal.corp.com', allowed)).toBe(true);
  });

  it('allows localhost', () => {
    expect(isDomainAllowed('localhost', allowed)).toBe(true);
  });

  it('allows whitelisted IP', () => {
    expect(isDomainAllowed('192.168.1.100', allowed)).toBe(true);
  });

  it('blocks a non-whitelisted domain', () => {
    expect(isDomainAllowed('evil.com', allowed)).toBe(false);
  });

  it('blocks subdomain of whitelisted domain (no wildcard)', () => {
    expect(isDomainAllowed('sub.internal.corp.com', allowed)).toBe(false);
  });

  it('allows all domains when allowedDomains is empty', () => {
    expect(isDomainAllowed('anything.com', [])).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- tests/security/domain-guard.test.ts
```

Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Implement domain guard**

`src/security/domain-guard.ts`:

```typescript
export function isDomainAllowed(hostname: string, allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) return true;
  return allowedDomains.includes(hostname);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- tests/security/domain-guard.test.ts
```

Expected: 6 tests PASS

- [ ] **Step 5: Write failing tests for restricted fetch**

`tests/security/restricted-fetch.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createRestrictedFetch } from '../../src/security/restricted-fetch.js';

describe('createRestrictedFetch', () => {
  const restrictedFetch = createRestrictedFetch(['localhost']);

  it('blocks requests to non-whitelisted domains', async () => {
    await expect(
      restrictedFetch('https://evil.com/data')
    ).rejects.toThrow('Domain not allowed: evil.com');
  });

  it('blocks requests to non-whitelisted IPs', async () => {
    await expect(
      restrictedFetch('https://8.8.8.8/data')
    ).rejects.toThrow('Domain not allowed: 8.8.8.8');
  });

  it('allows all when no domains are configured', async () => {
    const openFetch = createRestrictedFetch([]);
    // This will fail with network error (not domain error), which is expected
    await expect(
      openFetch('http://localhost:99999/nonexistent')
    ).rejects.not.toThrow('Domain not allowed');
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

```bash
pnpm test -- tests/security/restricted-fetch.test.ts
```

Expected: FAIL — `Cannot find module`

- [ ] **Step 7: Implement restricted fetch**

`src/security/restricted-fetch.ts`:

```typescript
import { isDomainAllowed } from './domain-guard.js';

export function createRestrictedFetch(
  allowedDomains: string[],
): typeof globalThis.fetch {
  return async (input, init?) => {
    const url = new URL(typeof input === 'string' ? input : (input as Request).url);
    if (!isDomainAllowed(url.hostname, allowedDomains)) {
      throw new Error(`Domain not allowed: ${url.hostname}`);
    }
    return globalThis.fetch(input, init);
  };
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
pnpm test -- tests/security/
```

Expected: 9 tests PASS

- [ ] **Step 9: Commit**

```bash
git add src/security/ tests/security/
git commit -m "feat: add domain whitelist security layer"
```

---

### Task 5: Built-in Tools

**Files:**
- Create: `src/tools/registry.ts`
- Create: `src/tools/file-read.ts`
- Create: `src/tools/file-write.ts`
- Create: `src/tools/bash-exec.ts`
- Test: `tests/tools/file-read.test.ts`
- Test: `tests/tools/file-write.test.ts`
- Test: `tests/tools/bash-exec.test.ts`

- [ ] **Step 1: Write failing tests for file-read tool**

`tests/tools/file-read.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fileReadTool } from '../../src/tools/file-read.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = join(import.meta.dirname, '__fixtures__');

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('fileReadTool', () => {
  it('has correct name and description', () => {
    expect(fileReadTool.name).toBe('file_read');
    expect(fileReadTool.description).toBeDefined();
  });

  it('reads an existing file', async () => {
    const filePath = join(TEST_DIR, 'test.txt');
    writeFileSync(filePath, 'hello world');

    const result = await fileReadTool.execute({ filePath });
    expect(result).toBe('hello world');
  });

  it('throws on non-existent file', async () => {
    await expect(
      fileReadTool.execute({ filePath: '/nonexistent/file.txt' })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- tests/tools/file-read.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement file-read tool**

`src/tools/file-read.ts`:

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';

export const fileReadTool = {
  name: 'file_read' as const,
  description: 'Read the contents of a file at the given path.',
  tool: tool({
    description: 'Read the contents of a file at the given path.',
    parameters: z.object({
      filePath: z.string().describe('Absolute path to the file to read'),
    }),
    execute: async ({ filePath }) => {
      return await readFile(filePath, 'utf-8');
    },
  }),
  execute: async (params: { filePath: string }) => {
    return await readFile(params.filePath, 'utf-8');
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- tests/tools/file-read.test.ts
```

Expected: 3 tests PASS

- [ ] **Step 5: Write failing tests for file-write tool**

`tests/tools/file-write.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fileWriteTool } from '../../src/tools/file-write.js';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = join(import.meta.dirname, '__fixtures__');

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('fileWriteTool', () => {
  it('has correct name and description', () => {
    expect(fileWriteTool.name).toBe('file_write');
    expect(fileWriteTool.description).toBeDefined();
  });

  it('writes content to a new file', async () => {
    const filePath = join(TEST_DIR, 'output.txt');
    const result = await fileWriteTool.execute({ filePath, content: 'hello world' });
    expect(result).toContain('Written');
    expect(readFileSync(filePath, 'utf-8')).toBe('hello world');
  });

  it('overwrites an existing file', async () => {
    const filePath = join(TEST_DIR, 'existing.txt');
    await fileWriteTool.execute({ filePath, content: 'first' });
    await fileWriteTool.execute({ filePath, content: 'second' });
    expect(readFileSync(filePath, 'utf-8')).toBe('second');
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

```bash
pnpm test -- tests/tools/file-write.test.ts
```

Expected: FAIL

- [ ] **Step 7: Implement file-write tool**

`src/tools/file-write.ts`:

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export const fileWriteTool = {
  name: 'file_write' as const,
  description: 'Write content to a file at the given path. Creates parent directories if needed.',
  tool: tool({
    description: 'Write content to a file at the given path. Creates parent directories if needed.',
    parameters: z.object({
      filePath: z.string().describe('Absolute path to the file to write'),
      content: z.string().describe('Content to write to the file'),
    }),
    execute: async ({ filePath, content }) => {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, 'utf-8');
      return `Written ${content.length} bytes to ${filePath}`;
    },
  }),
  execute: async (params: { filePath: string; content: string }) => {
    await mkdir(dirname(params.filePath), { recursive: true });
    await writeFile(params.filePath, params.content, 'utf-8');
    return `Written ${params.content.length} bytes to ${params.filePath}`;
  },
};
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
pnpm test -- tests/tools/file-write.test.ts
```

Expected: 3 tests PASS

- [ ] **Step 9: Write failing tests for bash-exec tool**

`tests/tools/bash-exec.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { bashExecTool } from '../../src/tools/bash-exec.js';

describe('bashExecTool', () => {
  it('has correct name and description', () => {
    expect(bashExecTool.name).toBe('bash_exec');
    expect(bashExecTool.description).toBeDefined();
  });

  it('executes a simple command', async () => {
    const result = await bashExecTool.execute({ command: 'echo hello' });
    expect(result.stdout.trim()).toBe('hello');
    expect(result.exitCode).toBe(0);
  });

  it('captures stderr', async () => {
    const result = await bashExecTool.execute({ command: 'echo error >&2' });
    expect(result.stderr.trim()).toBe('error');
  });

  it('returns non-zero exit code on failure', async () => {
    const result = await bashExecTool.execute({ command: 'exit 1' });
    expect(result.exitCode).toBe(1);
  });

  it('respects timeout', async () => {
    const result = await bashExecTool.execute({
      command: 'sleep 10',
      timeout: 500,
    });
    expect(result.exitCode).not.toBe(0);
  });
});
```

- [ ] **Step 10: Run tests to verify they fail**

```bash
pnpm test -- tests/tools/bash-exec.test.ts
```

Expected: FAIL

- [ ] **Step 11: Implement bash-exec tool**

`src/tools/bash-exec.ts`:

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import { execSync } from 'node:child_process';

interface BashResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export const bashExecTool = {
  name: 'bash_exec' as const,
  description: 'Execute a bash command and return stdout, stderr, and exit code.',
  tool: tool({
    description: 'Execute a bash command and return stdout, stderr, and exit code.',
    parameters: z.object({
      command: z.string().describe('The bash command to execute'),
      timeout: z.number().optional().describe('Timeout in milliseconds (default: 30000)'),
    }),
    execute: async ({ command, timeout }): Promise<BashResult> => {
      return executeBash(command, timeout);
    },
  }),
  execute: async (params: { command: string; timeout?: number }): Promise<BashResult> => {
    return executeBash(params.command, params.timeout);
  },
};

function executeBash(command: string, timeout?: number): BashResult {
  try {
    const stdout = execSync(command, {
      encoding: 'utf-8',
      timeout: timeout ?? 30000,
      shell: '/bin/bash',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
      exitCode: err.status ?? 1,
    };
  }
}
```

- [ ] **Step 12: Run tests to verify they pass**

```bash
pnpm test -- tests/tools/bash-exec.test.ts
```

Expected: 5 tests PASS

- [ ] **Step 13: Implement tool registry**

`src/tools/registry.ts`:

```typescript
import type { CoreTool } from 'ai';
import { fileReadTool } from './file-read.js';
import { fileWriteTool } from './file-write.js';
import { bashExecTool } from './bash-exec.js';

export function getBuiltinTools(): Record<string, CoreTool> {
  return {
    [fileReadTool.name]: fileReadTool.tool,
    [fileWriteTool.name]: fileWriteTool.tool,
    [bashExecTool.name]: bashExecTool.tool,
  };
}
```

- [ ] **Step 14: Run all tool tests**

```bash
pnpm test -- tests/tools/
```

Expected: 11 tests PASS

- [ ] **Step 15: Commit**

```bash
git add src/tools/ tests/tools/
git commit -m "feat: add built-in tools (file_read, file_write, bash_exec)"
```

---

### Task 6: Agent Loop

**Files:**
- Create: `src/agent/types.ts`
- Create: `src/agent/loop.ts`
- Test: `tests/agent/loop.test.ts`

- [ ] **Step 1: Implement agent types**

`src/agent/types.ts`:

```typescript
import type { CoreMessage } from 'ai';

export interface AgentOptions {
  systemPrompt: string;
  maxSteps: number;
}

export interface AgentState {
  messages: CoreMessage[];
  sessionId: string;
}

export const DEFAULT_SYSTEM_PROMPT = `You are PrivateClaw, a helpful AI assistant with access to tools.
You can read files, write files, and execute bash commands.
Always explain what you are doing before using a tool.
Be concise and direct.`;

export const DEFAULT_MAX_STEPS = 10;
```

- [ ] **Step 2: Write failing test for agent loop**

`tests/agent/loop.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { runAgentTurn } from '../../src/agent/loop.js';
import type { CoreMessage } from 'ai';

// Mock the AI SDK's streamText
vi.mock('ai', async () => {
  const actual = await vi.importActual('ai');
  return {
    ...actual,
    streamText: vi.fn().mockReturnValue({
      textStream: (async function* () {
        yield 'Hello, ';
        yield 'world!';
      })(),
      text: Promise.resolve('Hello, world!'),
      response: Promise.resolve({
        messages: [{ role: 'assistant', content: 'Hello, world!' }],
      }),
      finishReason: Promise.resolve('stop'),
    }),
  };
});

describe('runAgentTurn', () => {
  it('returns a text stream from the agent', async () => {
    const messages: CoreMessage[] = [
      { role: 'user', content: 'Hi there' },
    ];

    const result = await runAgentTurn({
      messages,
      onChunk: () => {},
    });

    expect(result.text).toBeDefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm test -- tests/agent/loop.test.ts
```

Expected: FAIL — `Cannot find module`

- [ ] **Step 4: Implement agent loop**

`src/agent/loop.ts`:

```typescript
import { streamText } from 'ai';
import type { CoreMessage, LanguageModelV1 } from 'ai';
import { getModel } from '../provider/registry.js';
import { getBuiltinTools } from '../tools/registry.js';
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_MAX_STEPS } from './types.js';

export interface RunAgentTurnOptions {
  messages: CoreMessage[];
  systemPrompt?: string;
  maxSteps?: number;
  model?: LanguageModelV1;
  onChunk?: (chunk: string) => void;
}

export interface AgentTurnResult {
  text: string;
  responseMessages: CoreMessage[];
}

export async function runAgentTurn(options: RunAgentTurnOptions): Promise<AgentTurnResult> {
  const {
    messages,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    maxSteps = DEFAULT_MAX_STEPS,
    model,
    onChunk,
  } = options;

  const result = streamText({
    model: model ?? getModel(),
    system: systemPrompt,
    messages,
    tools: getBuiltinTools(),
    maxSteps,
  });

  let fullText = '';
  for await (const chunk of result.textStream) {
    fullText += chunk;
    onChunk?.(chunk);
  }

  const response = await result.response;

  return {
    text: fullText,
    responseMessages: response.messages as CoreMessage[],
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test -- tests/agent/loop.test.ts
```

Expected: 1 test PASS

- [ ] **Step 6: Commit**

```bash
git add src/agent/ tests/agent/
git commit -m "feat: add agent loop with streaming and tool support"
```

---

### Task 7: Session Storage

**Files:**
- Create: `src/session/types.ts`
- Create: `src/session/db.ts`
- Create: `src/session/repository.ts`
- Test: `tests/session/db.test.ts`
- Test: `tests/session/repository.test.ts`

- [ ] **Step 1: Implement session types**

`src/session/types.ts`:

```typescript
import type { CoreMessage } from 'ai';

export interface Session {
  id: string;
  title: string;
  messages: CoreMessage[];
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Write failing tests for db**

`tests/session/db.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { createDatabase, closeDatabase } from '../../src/session/db.js';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DB = join(import.meta.dirname, '__test_sessions.db');

afterEach(() => {
  closeDatabase();
  rmSync(TEST_DB, { force: true });
  rmSync(TEST_DB + '-journal', { force: true });
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
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm test -- tests/session/db.test.ts
```

Expected: FAIL

- [ ] **Step 4: Implement database module**

`src/session/db.ts`:

```typescript
import Database from 'better-sqlite3';

let db: Database.Database | null = null;

export function createDatabase(dbPath: string): Database.Database {
  db = new Database(dbPath);

  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'Untitled',
      messages TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  return db;
}

export function getDatabase(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call createDatabase() first.');
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test -- tests/session/db.test.ts
```

Expected: 2 tests PASS

- [ ] **Step 6: Write failing tests for session repository**

`tests/session/repository.test.ts`:

```typescript
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
```

- [ ] **Step 7: Run tests to verify they fail**

```bash
pnpm test -- tests/session/repository.test.ts
```

Expected: FAIL

- [ ] **Step 8: Implement session repository**

`src/session/repository.ts`:

```typescript
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
```

- [ ] **Step 9: Run tests to verify they pass**

```bash
pnpm test -- tests/session/
```

Expected: 8 tests PASS

- [ ] **Step 10: Commit**

```bash
git add src/session/ tests/session/
git commit -m "feat: add SQLite session storage with CRUD operations"
```

---

### Task 8: CLI Interface

**Files:**
- Create: `src/cli/renderer.ts`
- Create: `src/cli/chat.ts`
- Create: `src/cli/app.ts`
- Create: `bin/privateclaw.ts`
- Create: `src/index.ts`

- [ ] **Step 1: Implement streaming renderer**

`src/cli/renderer.ts`:

```typescript
import chalk from 'chalk';

export function renderChunk(chunk: string): void {
  process.stdout.write(chunk);
}

export function renderNewLine(): void {
  process.stdout.write('\n');
}

export function renderSystemMessage(message: string): void {
  console.log(chalk.dim(`[system] ${message}`));
}

export function renderError(message: string): void {
  console.error(chalk.red(`[error] ${message}`));
}

export function renderToolCall(toolName: string, args: Record<string, unknown>): void {
  console.log(chalk.yellow(`\n[tool] ${toolName}`), chalk.dim(JSON.stringify(args)));
}

export function renderWelcome(): void {
  console.log(chalk.bold('\nPrivateClaw'));
  console.log(chalk.dim('Type your message and press Enter. Type /quit to exit.\n'));
}

export function renderSessionInfo(sessionId: string, providerName: string): void {
  console.log(chalk.dim(`Session: ${sessionId} | Provider: ${providerName}\n`));
}
```

- [ ] **Step 2: Implement chat REPL**

`src/cli/chat.ts`:

```typescript
import * as readline from 'node:readline';
import type { CoreMessage } from 'ai';
import { runAgentTurn } from '../agent/loop.js';
import { SessionRepository } from '../session/repository.js';
import { getProviderName } from '../provider/registry.js';
import {
  renderChunk,
  renderNewLine,
  renderError,
  renderWelcome,
  renderSessionInfo,
} from './renderer.js';

export async function startChat(sessionId?: string): Promise<void> {
  const repo = new SessionRepository();
  let session = sessionId
    ? repo.getById(sessionId)
    : null;

  if (!session) {
    session = repo.create('New Chat');
  }

  const messages: CoreMessage[] = [...session.messages];

  renderWelcome();
  renderSessionInfo(session.id, getProviderName());

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = (): Promise<string> =>
    new Promise((resolve) => rl.question('> ', resolve));

  try {
    while (true) {
      const input = await prompt();
      const trimmed = input.trim();

      if (trimmed === '/quit' || trimmed === '/exit') break;
      if (trimmed === '') continue;

      messages.push({ role: 'user', content: trimmed });

      try {
        const result = await runAgentTurn({
          messages,
          onChunk: renderChunk,
        });

        renderNewLine();
        messages.push(...result.responseMessages);
        repo.updateMessages(session!.id, messages);
      } catch (err) {
        renderError(err instanceof Error ? err.message : String(err));
      }
    }
  } finally {
    rl.close();
  }
}
```

- [ ] **Step 3: Implement CLI app with Commander.js**

`src/cli/app.ts`:

```typescript
import { Command } from 'commander';
import { loadConfig } from '../config/loader.js';
import { initProvider } from '../provider/registry.js';
import { createDatabase, closeDatabase } from '../session/db.js';
import { SessionRepository } from '../session/repository.js';
import { startChat } from './chat.js';
import { renderError, renderSystemMessage } from './renderer.js';

export function createApp(): Command {
  const program = new Command();

  program
    .name('privateclaw')
    .description('A self-hosted AI agent CLI')
    .version('0.1.0');

  program
    .command('chat')
    .description('Start an interactive chat session')
    .option('-c, --config <path>', 'Path to config file', 'privateclaw.config.json')
    .option('-s, --session <id>', 'Resume a previous session by ID')
    .action(async (opts: { config: string; session?: string }) => {
      try {
        const config = loadConfig(opts.config);
        initProvider(config.provider);
        createDatabase(config.session.dbPath);
        await startChat(opts.session);
      } catch (err) {
        renderError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      } finally {
        closeDatabase();
      }
    });

  program
    .command('sessions')
    .description('List all saved sessions')
    .option('-c, --config <path>', 'Path to config file', 'privateclaw.config.json')
    .action((opts: { config: string }) => {
      try {
        const config = loadConfig(opts.config);
        createDatabase(config.session.dbPath);
        const repo = new SessionRepository();
        const sessions = repo.list();

        if (sessions.length === 0) {
          renderSystemMessage('No sessions found.');
          return;
        }

        for (const s of sessions) {
          console.log(`  ${s.id}  ${s.title}  (${s.updatedAt})`);
        }
      } catch (err) {
        renderError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      } finally {
        closeDatabase();
      }
    });

  return program;
}
```

- [ ] **Step 4: Create CLI entrypoint**

`bin/privateclaw.ts`:

```typescript
#!/usr/bin/env node --import tsx
import { createApp } from '../src/cli/app.js';

const app = createApp();
app.parse(process.argv);
```

- [ ] **Step 5: Create package public export**

`src/index.ts`:

```typescript
export { loadConfig } from './config/loader.js';
export { ConfigSchema } from './config/schema.js';
export type { Config, ProviderConfig, SecurityConfig, SessionConfig } from './config/schema.js';
export { createProvider } from './provider/create.js';
export { initProvider, getModel, getProviderName } from './provider/registry.js';
export { createRestrictedFetch } from './security/restricted-fetch.js';
export { isDomainAllowed } from './security/domain-guard.js';
export { getBuiltinTools } from './tools/registry.js';
export { runAgentTurn } from './agent/loop.js';
export type { RunAgentTurnOptions, AgentTurnResult } from './agent/loop.js';
export { createDatabase, closeDatabase } from './session/db.js';
export { SessionRepository } from './session/repository.js';
export type { Session } from './session/types.js';
```

- [ ] **Step 6: Make entrypoint executable and test CLI help**

```bash
chmod +x bin/privateclaw.ts
pnpm dev -- --help
```

Expected output:
```
Usage: privateclaw [options] [command]

A self-hosted AI agent CLI

Options:
  -V, --version   output the version number
  -h, --help      display help for command

Commands:
  chat            Start an interactive chat session
  sessions        List all saved sessions
  help [command]  display help for command
```

- [ ] **Step 7: Run all tests**

```bash
pnpm test
```

Expected: All tests PASS (30+ tests)

- [ ] **Step 8: Commit**

```bash
git add bin/ src/cli/ src/index.ts
git commit -m "feat: add CLI interface with chat and session commands"
```

---

### Task 9: Integration — Wire Security to Agent

**Files:**
- Modify: `src/agent/loop.ts`
- Modify: `src/cli/app.ts`

- [ ] **Step 1: Update agent loop to accept custom fetch**

Edit `src/agent/loop.ts` — add `fetch` option to `RunAgentTurnOptions`:

```typescript
// Add to RunAgentTurnOptions interface:
export interface RunAgentTurnOptions {
  messages: CoreMessage[];
  systemPrompt?: string;
  maxSteps?: number;
  model?: LanguageModelV1;
  onChunk?: (chunk: string) => void;
  fetch?: typeof globalThis.fetch;
}

// Update streamText call in runAgentTurn:
const result = streamText({
  model: model ?? getModel(),
  system: systemPrompt,
  messages,
  tools: getBuiltinTools(),
  maxSteps,
  ...(options.fetch ? { fetch: options.fetch } : {}),
});
```

- [ ] **Step 2: Update CLI app to wire restricted fetch**

Edit `src/cli/app.ts` — in the `chat` action, create restricted fetch and pass it through. Add import and create a module-level variable:

```typescript
// Add import at top:
import { createRestrictedFetch } from '../security/restricted-fetch.js';

// In the chat action, after initProvider():
const restrictedFetch = createRestrictedFetch(config.security.allowedDomains);
await startChat(opts.session, restrictedFetch);
```

- [ ] **Step 3: Update chat.ts to pass fetch through**

Edit `src/cli/chat.ts` — update function signature and runAgentTurn call:

```typescript
export async function startChat(
  sessionId?: string,
  restrictedFetch?: typeof globalThis.fetch,
): Promise<void> {
  // ...
  const result = await runAgentTurn({
    messages,
    onChunk: renderChunk,
    fetch: restrictedFetch,
  });
  // ...
}
```

- [ ] **Step 4: Run all tests**

```bash
pnpm test
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/agent/loop.ts src/cli/app.ts src/cli/chat.ts
git commit -m "feat: wire domain whitelist security into agent loop"
```

---

### Task 10: End-to-End Smoke Test

**Files:**
- Create: `privateclaw.config.example.json` (already exists)

- [ ] **Step 1: Create a local test config with Ollama**

```bash
cp privateclaw.config.example.json privateclaw.config.json
```

Edit `privateclaw.config.json` to point to your local Ollama:

```json
{
  "provider": {
    "type": "ollama",
    "baseURL": "http://localhost:11434/api",
    "model": "llama3.2"
  },
  "security": {
    "allowedDomains": ["localhost"]
  }
}
```

- [ ] **Step 2: Start Ollama (if not running)**

```bash
ollama serve &
ollama pull llama3.2
```

- [ ] **Step 3: Run the CLI**

```bash
pnpm dev -- chat
```

Expected: Welcome message appears, prompt `>` shown. Type a message and get a streamed response.

- [ ] **Step 4: Test session persistence**

```bash
pnpm dev -- sessions
```

Expected: The session from Step 3 appears in the list.

- [ ] **Step 5: Test session resume**

```bash
pnpm dev -- chat --session <session-id-from-step-4>
```

Expected: Previous conversation context is loaded.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete Phase 1 core agent MVP"
```
