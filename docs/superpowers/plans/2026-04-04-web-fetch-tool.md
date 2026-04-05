# web_fetch Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LLM이 외부 URL에 HTTP 요청을 보낼 수 있는 `web_fetch` 도구를 추가하되, 도메인 화이트리스트를 통해 허용된 도메인만 접근 가능하게 한다.

**Architecture:** `web_fetch` 도구는 `restricted fetch`를 주입받아 사용한다. 도구 레지스트리가 `restricted fetch`를 받아서 `web_fetch` 도구에 전달하는 구조. 이를 위해 `getBuiltinTools()`가 `fetch` 파라미터를 받도록 변경한다.

**Tech Stack:** Vercel AI SDK `tool()`, Zod, Node.js `fetch`

---

## File Structure

```
변경:
├── src/tools/registry.ts          # getBuiltinTools()에 fetch 파라미터 추가
├── src/tools/web-fetch.ts         # web_fetch 도구 (NEW)
├── src/agent/loop.ts              # getBuiltinTools()에 fetch 전달
├── src/provider/registry.ts       # restrictedFetch를 모듈 레벨로 저장
├── src/index.ts                   # web_fetch export 추가
├── tests/tools/web-fetch.test.ts  # web_fetch 단위 테스트 (NEW)
```

---

### Task 1: web_fetch Tool 구현

**Files:**
- Create: `src/tools/web-fetch.ts`
- Test: `tests/tools/web-fetch.test.ts`

- [ ] **Step 1: Write failing tests for web_fetch**

`tests/tools/web-fetch.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createWebFetchTool } from '../../src/tools/web-fetch.js';

describe('createWebFetchTool', () => {
  it('has correct name and description', () => {
    const webFetch = createWebFetchTool(globalThis.fetch);
    expect(webFetch.name).toBe('web_fetch');
    expect(webFetch.description).toBeDefined();
  });

  it('fetches a URL using the provided fetch function', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<html>Hello</html>',
    });

    const webFetch = createWebFetchTool(mockFetch as unknown as typeof fetch);
    const result = await webFetch.execute({ url: 'https://example.com' });

    expect(mockFetch).toHaveBeenCalledWith('https://example.com');
    expect(result.status).toBe(200);
    expect(result.body).toBe('<html>Hello</html>');
  });

  it('returns error info when fetch fails', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Domain not allowed: evil.com'));

    const webFetch = createWebFetchTool(mockFetch as unknown as typeof fetch);
    const result = await webFetch.execute({ url: 'https://evil.com' });

    expect(result.error).toBe('Domain not allowed: evil.com');
  });

  it('returns error info on non-ok response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    });

    const webFetch = createWebFetchTool(mockFetch as unknown as typeof fetch);
    const result = await webFetch.execute({ url: 'https://example.com/missing' });

    expect(result.status).toBe(404);
    expect(result.body).toBe('Not Found');
  });

  it('respects restricted fetch (integration with domain guard)', async () => {
    const { createRestrictedFetch } = await import('../../src/security/restricted-fetch.js');
    const restricted = createRestrictedFetch(['localhost']);

    const webFetch = createWebFetchTool(restricted);
    const result = await webFetch.execute({ url: 'https://blocked.com/data' });

    expect(result.error).toBe('Domain not allowed: blocked.com');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- tests/tools/web-fetch.test.ts
```

Expected: FAIL — `Cannot find module '../../src/tools/web-fetch.js'`

- [ ] **Step 3: Implement web_fetch tool**

`src/tools/web-fetch.ts`:

```typescript
import { tool } from 'ai';
import { z } from 'zod';

interface WebFetchResult {
  status?: number;
  body?: string;
  error?: string;
}

export function createWebFetchTool(fetchFn: typeof globalThis.fetch) {
  return {
    name: 'web_fetch' as const,
    description: 'Fetch a URL and return the response body. Respects domain whitelist.',
    tool: tool({
      description: 'Fetch a URL and return the response body. Respects domain whitelist.',
      parameters: z.object({
        url: z.string().describe('The URL to fetch'),
      }),
      execute: async ({ url }): Promise<WebFetchResult> => {
        return doFetch(fetchFn, url);
      },
    }),
    execute: async (params: { url: string }): Promise<WebFetchResult> => {
      return doFetch(fetchFn, params.url);
    },
  };
}

async function doFetch(fetchFn: typeof globalThis.fetch, url: string): Promise<WebFetchResult> {
  try {
    const response = await fetchFn(url);
    const body = await response.text();
    return { status: response.status, body };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- tests/tools/web-fetch.test.ts
```

Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/web-fetch.ts tests/tools/web-fetch.test.ts
git commit -m "feat: add web_fetch tool with domain whitelist support"
```

---

### Task 2: Tool Registry에 web_fetch 연결

**Files:**
- Modify: `src/tools/registry.ts`
- Modify: `src/provider/registry.ts`
- Modify: `src/agent/loop.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Update provider registry to store and expose restrictedFetch**

`src/provider/registry.ts` — `getRestrictedFetch()` 함수 추가:

기존 코드 끝에 다음을 추가:

```typescript
let currentFetch: typeof globalThis.fetch | null = null;

// initProvider 함수를 수정하여 fetch도 저장:
// 기존: export function initProvider(config: ProviderConfig, fetch?: typeof globalThis.fetch): void {
//   const { model, provider } = createProvider(fetch ? { config, fetch } : config);
//   currentModel = model;
//   currentProviderName = provider;
// }
// 변경:
export function initProvider(config: ProviderConfig, fetch?: typeof globalThis.fetch): void {
  const { model, provider } = createProvider(fetch ? { config, fetch } : config);
  currentModel = model;
  currentProviderName = provider;
  currentFetch = fetch ?? null;
}

export function getRestrictedFetch(): typeof globalThis.fetch {
  return currentFetch ?? globalThis.fetch;
}
```

- [ ] **Step 2: Update tool registry to accept fetch and include web_fetch**

`src/tools/registry.ts`를 다음으로 교체:

```typescript
import type { CoreTool } from 'ai';
import { fileReadTool } from './file-read.js';
import { fileWriteTool } from './file-write.js';
import { bashExecTool } from './bash-exec.js';
import { createWebFetchTool } from './web-fetch.js';

export function getBuiltinTools(fetchFn?: typeof globalThis.fetch): Record<string, CoreTool> {
  const webFetch = createWebFetchTool(fetchFn ?? globalThis.fetch);
  return {
    [fileReadTool.name]: fileReadTool.tool,
    [fileWriteTool.name]: fileWriteTool.tool,
    [bashExecTool.name]: bashExecTool.tool,
    [webFetch.name]: webFetch.tool,
  };
}
```

- [ ] **Step 3: Update agent loop to pass restrictedFetch to tools**

`src/agent/loop.ts`에서 `getBuiltinTools()` 호출에 fetch 전달:

```typescript
import { getRestrictedFetch } from '../provider/registry.js';

// runAgentTurn 함수 내 streamText 호출 변경:
const result = streamText({
  model: model ?? getModel(),
  system: systemPrompt,
  messages,
  tools: getBuiltinTools(getRestrictedFetch()),
  maxSteps,
});
```

`fetch` 옵션 spread는 더 이상 필요 없으므로 제거.

- [ ] **Step 4: Update src/index.ts exports**

`src/index.ts`에 추가:

```typescript
export { createWebFetchTool } from './tools/web-fetch.js';
export { getRestrictedFetch } from './provider/registry.js';
```

- [ ] **Step 5: Run all tests**

```bash
pnpm test
```

Expected: All tests PASS (48+)

- [ ] **Step 6: Commit**

```bash
git add src/tools/registry.ts src/provider/registry.ts src/agent/loop.ts src/index.ts
git commit -m "feat: wire web_fetch tool into agent loop with restricted fetch"
```

---

### Task 3: E2E 도메인 차단 테스트

**Files:** 없음 (수동 테스트)

- [ ] **Step 1: 차단 테스트 — allowedDomains에 google.com 없음**

`privateclaw.config.json`:

```json
{
  "provider": {
    "type": "ollama",
    "baseURL": "http://localhost:11434/api",
    "model": "qwen2.5-coder:7b"
  },
  "security": {
    "allowedDomains": ["localhost"]
  }
}
```

```bash
echo -e "Please fetch the content from https://www.google.com and tell me what you see\n/quit" | npx tsx bin/privateclaw.ts chat
```

Expected: LLM이 `web_fetch` 도구를 호출하면 `Domain not allowed: www.google.com` 에러가 반환됨.

- [ ] **Step 2: 허용 테스트 — allowedDomains에 google.com 추가**

`privateclaw.config.json`:

```json
{
  "provider": {
    "type": "ollama",
    "baseURL": "http://localhost:11434/api",
    "model": "qwen2.5-coder:7b"
  },
  "security": {
    "allowedDomains": ["localhost", "www.google.com"]
  }
}
```

```bash
echo -e "Please fetch the content from https://www.google.com and tell me what you see\n/quit" | npx tsx bin/privateclaw.ts chat
```

Expected: LLM이 `web_fetch` 도구를 호출하고, 구글 HTML 내용을 가져와서 요약해 줌.

- [ ] **Step 3: Commit and push**

```bash
git add -A
git commit -m "test: verify web_fetch domain whitelist E2E"
git push
```
