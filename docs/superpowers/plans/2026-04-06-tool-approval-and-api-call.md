# Tool Approval & API Call Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tool 실행 전 사용자 승인을 요구하는 권한 시스템을 추가하고, GET/POST/PATCH/PUT/DELETE를 지원하는 api_call 도구를 추가한다.

**Architecture:** ToolApprovalManager가 tool별 승인 상태를 관리한다. 에이전트 루프에서 tool-call 이벤트 시 승인 매니저를 확인하고, 미승인이면 사용자에게 프롬프트를 표시한다. 사용자는 (1) 1회 허용, (2) 영구 허용, (3) 거절 중 선택한다. 거절 시 에이전트 턴을 즉시 중단하고 입력 대기로 복귀한다. api_call 도구는 web_fetch와 같은 패턴으로 restricted fetch를 주입받되, HTTP method/headers/body를 지원한다.

**Tech Stack:** TypeScript, Zod, Node.js readline, Vercel AI SDK

---

## File Structure

```
변경/생성:
├── src/approval/
│   ├── manager.ts              # ToolApprovalManager — 승인 상태 관리 (NEW)
│   └── types.ts                # 승인 관련 타입 정의 (NEW)
├── src/tools/
│   └── api-call.ts             # api_call 도구 (NEW)
├── src/tools/registry.ts       # api_call 추가
├── src/agent/loop.ts           # 승인 콜백 통합
├── src/agent/types.ts          # 시스템 프롬프트에 api_call 추가
├── src/cli/chat.ts             # 승인 프롬프트 UI + 거절 시 중단
├── src/cli/renderer.ts         # 승인 프롬프트 렌더링 함수 추가
├── src/index.ts                # 새 export 추가
├── tests/approval/
│   └── manager.test.ts         # 승인 매니저 단위 테스트 (NEW)
├── tests/tools/
│   └── api-call.test.ts        # api_call 단위 테스트 (NEW)
```

---

### Task 1: Tool Approval Manager

**Files:**
- Create: `src/approval/types.ts`
- Create: `src/approval/manager.ts`
- Test: `tests/approval/manager.test.ts`

- [ ] **Step 1: Write failing tests for ToolApprovalManager**

`tests/approval/manager.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ToolApprovalManager } from '../../src/approval/manager.js';

describe('ToolApprovalManager', () => {
  let manager: ToolApprovalManager;

  beforeEach(() => {
    manager = new ToolApprovalManager();
  });

  it('returns "pending" for unknown tools', () => {
    expect(manager.getStatus('file_read')).toBe('pending');
  });

  it('allows a tool permanently', () => {
    manager.allowAlways('file_read');
    expect(manager.getStatus('file_read')).toBe('always');
  });

  it('allows a tool once', () => {
    manager.allowOnce('bash_exec');
    expect(manager.getStatus('bash_exec')).toBe('once');
  });

  it('resets "once" status after consume', () => {
    manager.allowOnce('bash_exec');
    expect(manager.getStatus('bash_exec')).toBe('once');
    manager.consume('bash_exec');
    expect(manager.getStatus('bash_exec')).toBe('pending');
  });

  it('does not reset "always" status after consume', () => {
    manager.allowAlways('file_read');
    manager.consume('file_read');
    expect(manager.getStatus('file_read')).toBe('always');
  });

  it('needsApproval returns true for pending tools', () => {
    expect(manager.needsApproval('web_fetch')).toBe(true);
  });

  it('needsApproval returns false for always-allowed tools', () => {
    manager.allowAlways('web_fetch');
    expect(manager.needsApproval('web_fetch')).toBe(false);
  });

  it('needsApproval returns false for once-allowed tools (not yet consumed)', () => {
    manager.allowOnce('web_fetch');
    expect(manager.needsApproval('web_fetch')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- tests/approval/manager.test.ts
```

Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Implement approval types**

`src/approval/types.ts`:

```typescript
export type ApprovalStatus = 'pending' | 'once' | 'always';

export type ApprovalDecision = 'allow_once' | 'allow_always' | 'deny';
```

- [ ] **Step 4: Implement ToolApprovalManager**

`src/approval/manager.ts`:

```typescript
import type { ApprovalStatus } from './types.js';

export class ToolApprovalManager {
  private statuses = new Map<string, ApprovalStatus>();

  getStatus(toolName: string): ApprovalStatus {
    return this.statuses.get(toolName) ?? 'pending';
  }

  needsApproval(toolName: string): boolean {
    const status = this.getStatus(toolName);
    return status === 'pending';
  }

  allowAlways(toolName: string): void {
    this.statuses.set(toolName, 'always');
  }

  allowOnce(toolName: string): void {
    this.statuses.set(toolName, 'once');
  }

  consume(toolName: string): void {
    const status = this.getStatus(toolName);
    if (status === 'once') {
      this.statuses.set(toolName, 'pending');
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test -- tests/approval/manager.test.ts
```

Expected: 8 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/approval/ tests/approval/
git commit -m "feat: add ToolApprovalManager for tool execution permissions"
```

---

### Task 2: Approval Prompt UI

**Files:**
- Modify: `src/cli/renderer.ts`
- Modify: `src/cli/chat.ts`
- Modify: `src/agent/loop.ts`

- [ ] **Step 1: Add approval prompt renderer**

`src/cli/renderer.ts` — 파일 끝에 추가:

```typescript
export function renderApprovalPrompt(toolName: string, args: unknown): void {
  console.log(chalk.bold.yellow(`\n⚠ Tool "${toolName}" wants to execute:`));
  console.log(chalk.dim(JSON.stringify(args, null, 2)));
  console.log(chalk.yellow('  [y] Allow once  [a] Allow always  [n] Deny'));
}

export function renderApprovalResult(toolName: string, decision: string): void {
  if (decision === 'deny') {
    console.log(chalk.red(`✗ "${toolName}" denied. Stopping agent.`));
  } else if (decision === 'allow_always') {
    console.log(chalk.green(`✓ "${toolName}" allowed permanently.`));
  } else {
    console.log(chalk.green(`✓ "${toolName}" allowed once.`));
  }
}
```

- [ ] **Step 2: Add approval callback to agent loop**

`src/agent/loop.ts` — `RunAgentTurnOptions`에 승인 콜백 추가:

```typescript
import type { ApprovalDecision } from '../approval/types.js';

export interface RunAgentTurnOptions {
  messages: ModelMessage[];
  systemPrompt?: string;
  maxSteps?: number;
  model?: LanguageModel;
  onChunk?: (chunk: string) => void;
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
  onToolResult?: (toolName: string, result: unknown) => void;
  onToolApproval?: (toolName: string, args: Record<string, unknown>) => Promise<ApprovalDecision>;
}
```

`runAgentTurn` 함수의 fullStream 루프에서 `tool-call` case를 수정:

```typescript
      case 'tool-call': {
        const callPart = part as unknown as { toolName: string; input: Record<string, unknown> };
        if (options.onToolApproval) {
          const decision = await options.onToolApproval(callPart.toolName, callPart.input);
          if (decision === 'deny') {
            // Abort the stream — return partial result
            return {
              text: fullText,
              responseMessages: [],
              aborted: true,
            };
          }
        }
        options.onToolCall?.(callPart.toolName, callPart.input);
        break;
      }
```

`AgentTurnResult`에 `aborted` 필드 추가:

```typescript
export interface AgentTurnResult {
  text: string;
  responseMessages: ModelMessage[];
  aborted?: boolean;
}
```

- [ ] **Step 3: Integrate approval into chat.ts**

`src/cli/chat.ts` — 승인 매니저와 프롬프트를 통합:

```typescript
import { ToolApprovalManager } from '../approval/manager.js';
import type { ApprovalDecision } from '../approval/types.js';
import {
  renderChunk,
  renderNewLine,
  renderError,
  renderWelcome,
  renderSessionInfo,
  renderToolCall,
  renderToolResult,
  renderApprovalPrompt,
  renderApprovalResult,
} from './renderer.js';

export async function startChat(
  sessionId?: string,
): Promise<void> {
  const repo = new SessionRepository();
  const approvalManager = new ToolApprovalManager();
  // ... existing session setup ...

  const askApproval = (rl: readline.Interface) =>
    (toolName: string, args: Record<string, unknown>): Promise<ApprovalDecision> => {
      if (!approvalManager.needsApproval(toolName)) {
        approvalManager.consume(toolName);
        return Promise.resolve('allow_once');
      }
      renderApprovalPrompt(toolName, args);
      return new Promise((resolve) => {
        rl.question('> ', (answer) => {
          const choice = answer.trim().toLowerCase();
          let decision: ApprovalDecision;
          if (choice === 'a') {
            decision = 'allow_always';
            approvalManager.allowAlways(toolName);
          } else if (choice === 'y') {
            decision = 'allow_once';
            approvalManager.allowOnce(toolName);
            approvalManager.consume(toolName);
          } else {
            decision = 'deny';
          }
          renderApprovalResult(toolName, decision);
          resolve(decision);
        });
      });
    };

  // In the runAgentTurn call:
  const result = await runAgentTurn({
    messages,
    onChunk: renderChunk,
    onToolCall: (name, args) => renderToolCall(name, args),
    onToolResult: (name, result) => {
      renderToolResult(name, result);
      const res = result as Record<string, unknown> | undefined;
      if (res?.error) {
        renderError(`Tool "${name}" failed: ${res.error}`);
      }
    },
    onToolApproval: askApproval(rl),
  });

  if (result.aborted) {
    renderError('Agent stopped by user.');
    continue;  // Back to input prompt
  }
```

- [ ] **Step 4: Run all tests**

```bash
pnpm test
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/renderer.ts src/cli/chat.ts src/agent/loop.ts
git commit -m "feat: add tool approval prompt with once/always/deny options"
```

---

### Task 3: API Call Tool

**Files:**
- Create: `src/tools/api-call.ts`
- Test: `tests/tools/api-call.test.ts`

- [ ] **Step 1: Write failing tests for api_call**

`tests/tools/api-call.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createApiCallTool } from '../../src/tools/api-call.js';

describe('createApiCallTool', () => {
  it('has correct name and description', () => {
    const apiCall = createApiCallTool(globalThis.fetch);
    expect(apiCall.name).toBe('api_call');
    expect(apiCall.description).toBeDefined();
  });

  it('makes a GET request', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => '{"data":"hello"}',
    });

    const apiCall = createApiCallTool(mockFetch as unknown as typeof fetch);
    const result = await apiCall.execute({ url: 'https://api.example.com/data', method: 'GET' });

    expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/data', expect.objectContaining({ method: 'GET' }));
    expect(result.status).toBe(200);
    expect(result.body).toBe('{"data":"hello"}');
  });

  it('makes a POST request with body and headers', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => '{"id":1}',
    });

    const apiCall = createApiCallTool(mockFetch as unknown as typeof fetch);
    const result = await apiCall.execute({
      url: 'https://api.example.com/items',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"name":"test"}',
    });

    expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/items', expect.objectContaining({
      method: 'POST',
      body: '{"name":"test"}',
      headers: { 'Content-Type': 'application/json' },
    }));
    expect(result.status).toBe(201);
  });

  it('makes a PUT request', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers(),
      text: async () => 'updated',
    });

    const apiCall = createApiCallTool(mockFetch as unknown as typeof fetch);
    const result = await apiCall.execute({
      url: 'https://api.example.com/items/1',
      method: 'PUT',
      body: '{"name":"updated"}',
    });

    expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/items/1', expect.objectContaining({ method: 'PUT' }));
    expect(result.status).toBe(200);
  });

  it('makes a PATCH request', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers(),
      text: async () => 'patched',
    });

    const apiCall = createApiCallTool(mockFetch as unknown as typeof fetch);
    const result = await apiCall.execute({
      url: 'https://api.example.com/items/1',
      method: 'PATCH',
      body: '{"name":"patched"}',
    });

    expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/items/1', expect.objectContaining({ method: 'PATCH' }));
    expect(result.status).toBe(200);
  });

  it('makes a DELETE request', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 204,
      headers: new Headers(),
      text: async () => '',
    });

    const apiCall = createApiCallTool(mockFetch as unknown as typeof fetch);
    const result = await apiCall.execute({
      url: 'https://api.example.com/items/1',
      method: 'DELETE',
    });

    expect(result.status).toBe(204);
  });

  it('respects domain whitelist', async () => {
    const { createRestrictedFetch } = await import('../../src/security/restricted-fetch.js');
    const restricted = createRestrictedFetch(['localhost']);

    const apiCall = createApiCallTool(restricted);
    const result = await apiCall.execute({
      url: 'https://blocked.com/api',
      method: 'GET',
    });

    expect(result.error).toContain('Domain not allowed: blocked.com');
  });

  it('returns error on fetch failure', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const apiCall = createApiCallTool(mockFetch as unknown as typeof fetch);
    const result = await apiCall.execute({ url: 'https://api.example.com', method: 'GET' });

    expect(result.error).toContain('Network error');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- tests/tools/api-call.test.ts
```

Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Implement api_call tool**

`src/tools/api-call.ts`:

```typescript
import { z } from 'zod';

interface ApiCallResult {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
  error?: string;
}

const parameters = z.object({
  url: z.string().describe('The URL to call'),
  method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']).describe('HTTP method'),
  headers: z.record(z.string()).optional().describe('HTTP headers as key-value pairs'),
  body: z.string().optional().describe('Request body (for POST, PATCH, PUT)'),
});

async function doApiCall(
  fetchFn: typeof globalThis.fetch,
  params: z.infer<typeof parameters>,
): Promise<ApiCallResult> {
  try {
    const response = await fetchFn(params.url, {
      method: params.method,
      headers: params.headers,
      body: params.body,
    });

    const body = await response.text();
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return { status: response.status, body, headers: responseHeaders };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      error: `TOOL FAILED: ${message}. You MUST report this error to the user. Do NOT make up or guess the content.`,
    };
  }
}

export function createApiCallTool(fetchFn: typeof globalThis.fetch) {
  return {
    name: 'api_call' as const,
    description: 'Make an HTTP API call with specified method, headers, and body. Supports GET, POST, PATCH, PUT, DELETE. Respects domain whitelist.',
    tool: {
      description: 'Make an HTTP API call with specified method, headers, and body. Supports GET, POST, PATCH, PUT, DELETE. Respects domain whitelist.',
      parameters,
      execute: async (input: z.infer<typeof parameters>): Promise<ApiCallResult> => {
        return doApiCall(fetchFn, input);
      },
    },
    execute: async (params: z.infer<typeof parameters>): Promise<ApiCallResult> => {
      return doApiCall(fetchFn, params);
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- tests/tools/api-call.test.ts
```

Expected: 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/api-call.ts tests/tools/api-call.test.ts
git commit -m "feat: add api_call tool with GET/POST/PATCH/PUT/DELETE support"
```

---

### Task 4: Wire API Call into Registry and System Prompt

**Files:**
- Modify: `src/tools/registry.ts`
- Modify: `src/agent/types.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Add api_call to tool registry**

`src/tools/registry.ts`:

```typescript
import { fileReadTool } from './file-read.js';
import { fileWriteTool } from './file-write.js';
import { bashExecTool } from './bash-exec.js';
import { createWebFetchTool } from './web-fetch.js';
import { createApiCallTool } from './api-call.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getBuiltinTools(fetchFn?: typeof globalThis.fetch): Record<string, any> {
  const f = fetchFn ?? globalThis.fetch;
  const webFetch = createWebFetchTool(f);
  const apiCall = createApiCallTool(f);
  return {
    [fileReadTool.name]: fileReadTool.tool,
    [fileWriteTool.name]: fileWriteTool.tool,
    [bashExecTool.name]: bashExecTool.tool,
    [webFetch.name]: webFetch.tool,
    [apiCall.name]: apiCall.tool,
  };
}
```

- [ ] **Step 2: Update system prompt**

`src/agent/types.ts` — DEFAULT_SYSTEM_PROMPT의 도구 목록에 api_call 추가:

```typescript
export const DEFAULT_SYSTEM_PROMPT = `You are PrivateClaw, a helpful AI assistant with access to the following tools:

- file_read: Read file contents from a given path
- file_write: Write content to a file at a given path
- bash_exec: Execute a bash command and return the output
- web_fetch: Fetch a URL and return the response body
- api_call: Make an HTTP API call (GET, POST, PATCH, PUT, DELETE) with custom headers and body

When a user asks you to search the web, access a website, or retrieve online content, always use the web_fetch tool.
When a user asks you to call an API or make HTTP requests with specific methods, headers, or request bodies, use the api_call tool.
When a user asks about your capabilities, list all five tools above.
Always use the appropriate tool rather than guessing or making up information.
CRITICAL RULES:
- If a tool returns an error, you MUST tell the user the exact error message. Do NOT make up or guess results.
- If web_fetch or api_call returns "Domain not allowed", say: "The domain is blocked by the security policy." Do NOT generate fake content.
- NEVER fabricate information. Only report what tools actually returned.
Be concise and direct.`;
```

- [ ] **Step 3: Update src/index.ts exports**

`src/index.ts`에 추가:

```typescript
export { createApiCallTool } from './tools/api-call.js';
export { ToolApprovalManager } from './approval/manager.js';
export type { ApprovalStatus, ApprovalDecision } from './approval/types.js';
```

- [ ] **Step 4: Run all tests and build**

```bash
pnpm test && pnpm build
```

Expected: All tests PASS, build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/tools/registry.ts src/agent/types.ts src/index.ts
git commit -m "feat: wire api_call tool and approval system into agent"
```

---

### Task 5: E2E Integration Test

**Files:** 없음 (수동 테스트)

- [ ] **Step 1: 승인 프롬프트 테스트 — 1회 허용**

```bash
npx tsx bin/privateclaw.ts chat
```

```
> 현재 디렉토리의 파일 목록을 보여줘.

⚠ Tool "bash_exec" wants to execute:
{"command":"ls -l"}
  [y] Allow once  [a] Allow always  [n] Deny
> y
✓ "bash_exec" allowed once.

[tool:call] bash_exec {"command":"ls -l"}
[tool:result] bash_exec {"stdout":"...","exitCode":0}
```

다시 같은 도구 사용 시 다시 물어야 함.

- [ ] **Step 2: 승인 프롬프트 테스트 — 영구 허용**

```
> README.md 파일을 읽어줘.

⚠ Tool "file_read" wants to execute:
{"filePath":"README.md"}
  [y] Allow once  [a] Allow always  [n] Deny
> a
✓ "file_read" allowed permanently.
```

이후 file_read 사용 시 더 이상 물어보지 않아야 함.

- [ ] **Step 3: 승인 프롬프트 테스트 — 거절**

```
> rm -rf / 실행해봐

⚠ Tool "bash_exec" wants to execute:
{"command":"rm -rf /"}
  [y] Allow once  [a] Allow always  [n] Deny
> n
✗ "bash_exec" denied. Stopping agent.
[error] Agent stopped by user.
>
```

입력 대기 상태로 복귀해야 함.

- [ ] **Step 4: api_call 테스트**

`privateclaw.config.json`에 `allowedDomains`에 테스트 API 도메인 추가 후:

```
> httpbin.org에 POST 요청을 보내서 {"name":"test"} 데이터를 전송해줘.

⚠ Tool "api_call" wants to execute:
{"url":"https://httpbin.org/post","method":"POST","headers":{"Content-Type":"application/json"},"body":"{\"name\":\"test\"}"}
  [y] Allow once  [a] Allow always  [n] Deny
> y
```

- [ ] **Step 5: Commit and push**

```bash
git add -A
git commit -m "feat: complete tool approval system and api_call tool"
git push -u origin feature/tool-approval-and-api-call
```
