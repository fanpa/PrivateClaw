# MD-based Skills System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LLM이 `use_skill` 도구로 마크다운 기반 스킬 문서를 로드하고, 그 안의 워크플로우 지시에 따라 동작할 수 있게 한다.

**Architecture:** Config에 스킬 목록(이름+설명)을 등록한다. `skills/<name>/skill.md` 파일에 워크플로우가 작성된다. `use_skill` 도구는 스킬 이름을 받아 해당 skill.md를 읽어 내용을 반환한다. 시스템 프롬프트에 사용 가능한 스킬 목록이 포함되어 LLM이 필요할 때 `use_skill`을 호출한다.

**Tech Stack:** TypeScript, Zod, Node.js fs

---

## File Structure

```
변경/생성:
├── src/skills/
│   ├── loader.ts               # 스킬 목록 로드 + skill.md 읽��� (NEW)
│   └── types.ts                # 스킬 관련 타입 (NEW)
├── src/tools/
│   └── use-skill.ts            # use_skill 도구 (NEW)
├── src/config/schema.ts        # skills 필드 추가
├── src/tools/registry.ts       # use_skill 추가
├── src/agent/loop.ts           # skills 옵션 전달
├── src/agent/types.ts          # 시스템 프롬프트에 스킬 목록 동적 포함
├── src/cli/app.ts              # config.skills 전달
├── src/cli/chat.ts             # skills 전달
��── src/index.ts                # 새 export 추가
├── tests/skills/
│   └── loader.test.ts          # 스킬 로더 테스트 (NEW)
├── tests/tools/
│   └── use-skill.test.ts       # use_skill 도구 테스트 (NEW)
├── skills/                     # 예시 스킬 디렉토리 (NEW)
│   └── failure-analysis/
│       └── skill.md            # 예시 스킬 문서 (NEW)
├── privateclaw.config.example.json  # skills 예시 추가
```

---

### Task 1: Skill Types and Loader

**Files:**
- Create: `src/skills/types.ts`
- Create: `src/skills/loader.ts`
- Test: `tests/skills/loader.test.ts`

- [ ] **Step 1: Write failing tests for skill loader**

`tests/skills/loader.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadSkillContent, listSkills } from '../../src/skills/loader.js';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_SKILLS_DIR = join(import.meta.dirname, '__test_skills__');

beforeEach(() => {
  mkdirSync(join(TEST_SKILLS_DIR, 'failure-analysis'), { recursive: true });
  writeFileSync(
    join(TEST_SKILLS_DIR, 'failure-analysis', 'skill.md'),
    '# Failure Analysis\n\n## Workflow\n\n1. If error log exists, read it.\n2. Summarize the root cause.',
  );
  mkdirSync(join(TEST_SKILLS_DIR, 'code-review'), { recursive: true });
  writeFileSync(
    join(TEST_SKILLS_DIR, 'code-review', 'skill.md'),
    '# Code Review\n\n## Workflow\n\n1. Read the changed files.\n2. Check for bugs.',
  );
});

afterEach(() => {
  rmSync(TEST_SKILLS_DIR, { recursive: true, force: true });
});

describe('loadSkillContent', () => {
  it('loads skill.md content by name', () => {
    const content = loadSkillContent('failure-analysis', TEST_SKILLS_DIR);
    expect(content).toContain('# Failure Analysis');
    expect(content).toContain('Summarize the root cause');
  });

  it('throws on non-existent skill', () => {
    expect(() => loadSkillContent('nonexistent', TEST_SKILLS_DIR)).toThrow();
  });
});

describe('listSkills', () => {
  it('lists all skills from config', () => {
    const skills = [
      { name: 'failure-analysis', description: 'Analyze failures from logs' },
      { name: 'code-review', description: 'Review code changes' },
    ];
    const list = listSkills(skills);
    expect(list).toContain('failure-analysis');
    expect(list).toContain('Analyze failures from logs');
    expect(list).toContain('code-review');
  });

  it('returns empty message when no skills', () => {
    const list = listSkills([]);
    expect(list).toContain('No skills');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- tests/skills/loader.test.ts
```

Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Implement skill types**

`src/skills/types.ts`:

```typescript
export interface SkillConfig {
  name: string;
  description: string;
}
```

- [ ] **Step 4: Implement skill loader**

`src/skills/loader.ts`:

```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SkillConfig } from './types.js';

export function loadSkillContent(skillName: string, skillsDir: string): string {
  const skillPath = join(skillsDir, skillName, 'skill.md');
  return readFileSync(skillPath, 'utf-8');
}

export function listSkills(skills: SkillConfig[]): string {
  if (skills.length === 0) return 'No skills registered.';
  return skills.map((s) => `- ${s.name}: ${s.description}`).join('\n');
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test -- tests/skills/loader.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/skills/ tests/skills/
git commit -m "feat: add skill types and loader"
```

---

### Task 2: use_skill Tool

**Files:**
- Create: `src/tools/use-skill.ts`
- Test: `tests/tools/use-skill.test.ts`

- [ ] **Step 1: Write failing tests for use_skill**

`tests/tools/use-skill.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createUseSkillTool } from '../../src/tools/use-skill.js';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_SKILLS_DIR = join(import.meta.dirname, '__test_skills__');

beforeEach(() => {
  mkdirSync(join(TEST_SKILLS_DIR, 'my-skill'), { recursive: true });
  writeFileSync(
    join(TEST_SKILLS_DIR, 'my-skill', 'skill.md'),
    '# My Skill\n\nDo something useful.',
  );
});

afterEach(() => {
  rmSync(TEST_SKILLS_DIR, { recursive: true, force: true });
});

describe('createUseSkillTool', () => {
  const skills = [{ name: 'my-skill', description: 'A test skill' }];

  it('has correct name', () => {
    const tool = createUseSkillTool(skills, TEST_SKILLS_DIR);
    expect(tool.name).toBe('use_skill');
  });

  it('loads a registered skill', async () => {
    const tool = createUseSkillTool(skills, TEST_SKILLS_DIR);
    const result = await tool.execute({ skillName: 'my-skill' });
    expect(result.content).toContain('# My Skill');
    expect(result.content).toContain('Do something useful');
  });

  it('returns error for unregistered skill', async () => {
    const tool = createUseSkillTool(skills, TEST_SKILLS_DIR);
    const result = await tool.execute({ skillName: 'unknown' });
    expect(result.error).toContain('not registered');
  });

  it('returns error for missing skill file', async () => {
    const skillsWithMissing = [{ name: 'ghost', description: 'Does not exist on disk' }];
    const tool = createUseSkillTool(skillsWithMissing, TEST_SKILLS_DIR);
    const result = await tool.execute({ skillName: 'ghost' });
    expect(result.error).toBeDefined();
  });

  it('includes available skills list in error for unregistered skill', async () => {
    const tool = createUseSkillTool(skills, TEST_SKILLS_DIR);
    const result = await tool.execute({ skillName: 'wrong' });
    expect(result.error).toContain('my-skill');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- tests/tools/use-skill.test.ts
```

Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Implement use_skill tool**

`src/tools/use-skill.ts`:

```typescript
import { z } from 'zod';
import { loadSkillContent } from '../skills/loader.js';
import type { SkillConfig } from '../skills/types.js';

interface UseSkillResult {
  content?: string;
  error?: string;
}

const parameters = z.object({
  skillName: z.string().describe('The name of the skill to load'),
});

export function createUseSkillTool(skills: SkillConfig[], skillsDir: string) {
  const registeredNames = new Set(skills.map((s) => s.name));

  return {
    name: 'use_skill' as const,
    description: 'Load a skill document by name. The skill contains workflow instructions to follow.',
    tool: {
      description: 'Load a skill document by name. The skill contains workflow instructions to follow. Call this when you need to follow a specific workflow or procedure.',
      parameters,
      execute: async ({ skillName }: z.infer<typeof parameters>): Promise<UseSkillResult> => {
        return doLoadSkill(skillName, registeredNames, skills, skillsDir);
      },
    },
    execute: async (params: { skillName: string }): Promise<UseSkillResult> => {
      return doLoadSkill(params.skillName, registeredNames, skills, skillsDir);
    },
  };
}

function doLoadSkill(
  skillName: string,
  registeredNames: Set<string>,
  skills: SkillConfig[],
  skillsDir: string,
): UseSkillResult {
  if (!registeredNames.has(skillName)) {
    const available = skills.map((s) => s.name).join(', ');
    return {
      error: `Skill "${skillName}" is not registered. Available skills: ${available || 'none'}`,
    };
  }

  try {
    const content = loadSkillContent(skillName, skillsDir);
    return { content };
  } catch (err) {
    return {
      error: `Failed to load skill "${skillName}": ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- tests/tools/use-skill.test.ts
```

Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/use-skill.ts tests/tools/use-skill.test.ts
git commit -m "feat: add use_skill tool for loading skill documents"
```

---

### Task 3: Config, Registry, System Prompt Integration

**Files:**
- Modify: `src/config/schema.ts`
- Modify: `src/tools/registry.ts`
- Modify: `src/agent/types.ts`
- Modify: `src/agent/loop.ts`
- Modify: `src/cli/app.ts`
- Modify: `src/cli/chat.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Add skills to config schema**

`src/config/schema.ts` — `SkillEntrySchema`와 `skills` 필드 추가:

```typescript
const SkillEntrySchema = z.object({
  name: z.string(),
  description: z.string(),
});

// ConfigSchema에 추가:
export const ConfigSchema = z.object({
  provider: ProviderSchema,
  security: SecuritySchema.default({}),
  session: SessionSchema.default({}),
  skills: z.array(SkillEntrySchema).default([]),
  skillsDir: z.string().default('./skills'),
});
```

- [ ] **Step 2: Add use_skill to tool registry**

`src/tools/registry.ts` — `BuiltinToolsOptions`에 skills 추��:

```typescript
import { createUseSkillTool } from './use-skill.js';
import type { SkillConfig } from '../skills/types.js';

export interface BuiltinToolsOptions {
  fetchFn?: typeof globalThis.fetch;
  defaultHeaders?: Record<string, Record<string, string>>;
  skills?: SkillConfig[];
  skillsDir?: string;
}

export function getBuiltinTools(options: BuiltinToolsOptions = {}): Record<string, any> {
  const f = options.fetchFn ?? globalThis.fetch;
  const webFetch = createWebFetchTool(f);
  const apiCall = createApiCallTool(f, options.defaultHeaders ?? {});
  const tools: Record<string, any> = {
    [fileReadTool.name]: fileReadTool.tool,
    [fileWriteTool.name]: fileWriteTool.tool,
    [bashExecTool.name]: bashExecTool.tool,
    [webFetch.name]: webFetch.tool,
    [apiCall.name]: apiCall.tool,
  };

  if (options.skills && options.skills.length > 0) {
    const useSkill = createUseSkillTool(options.skills, options.skillsDir ?? './skills');
    tools[useSkill.name] = useSkill.tool;
  }

  return tools;
}
```

- [ ] **Step 3: Make system prompt dynamic with skill list**

`src/agent/types.ts` — `buildSystemPrompt` 함수 추가:

```typescript
import type { SkillConfig } from '../skills/types.js';
import { listSkills } from '../skills/loader.js';

export function buildSystemPrompt(skills: SkillConfig[] = []): string {
  let prompt = `You are PrivateClaw, a helpful AI assistant with access to the following tools:

- file_read: Read file contents from a given path
- file_write: Write content to a file at a given path
- bash_exec: Execute a bash command and return the output
- web_fetch: Fetch a URL and return the response body
- api_call: Make an HTTP API call (GET, POST, PATCH, PUT, DELETE) with custom headers and body`;

  if (skills.length > 0) {
    prompt += `\n- use_skill: Load a skill document to follow its workflow instructions`;
    prompt += `\n\nAvailable skills:\n${listSkills(skills)}`;
    prompt += `\nWhen a task matches a skill description, use the use_skill tool to load it, then follow its workflow instructions step by step.`;
  }

  prompt += `

When a user asks you to search the web, access a website, or retrieve online content, always use the web_fetch tool.
When a user asks you to call an API or make HTTP requests with specific methods, headers, or request bodies, use the api_call tool.
When a user asks about your capabilities, list all tools above.
Always use the appropriate tool rather than guessing or making up information.
CRITICAL RULES:
- If a tool returns an error, you MUST tell the user the exact error message. Do NOT make up or guess results.
- If web_fetch or api_call returns "Domain not allowed", say: "The domain is blocked by the security policy." Do NOT generate fake content.
- NEVER fabricate information. Only report what tools actually returned.
Be concise and direct.`;

  return prompt;
}
```

Keep `DEFAULT_SYSTEM_PROMPT` as the fallback (no skills), and `DEFAULT_MAX_STEPS`.

- [ ] **Step 4: Update agent loop to accept skills**

`src/agent/loop.ts` — `RunAgentTurnOptions`에 skills 추가, `buildSystemPrompt` 사용:

```typescript
import type { SkillConfig } from '../skills/types.js';
import { buildSystemPrompt } from './types.js';

export interface RunAgentTurnOptions {
  messages: ModelMessage[];
  systemPrompt?: string;
  maxSteps?: number;
  model?: LanguageModel;
  defaultHeaders?: Record<string, Record<string, string>>;
  skills?: SkillConfig[];
  skillsDir?: string;
  onChunk?: (chunk: string) => void;
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
  onToolResult?: (toolName: string, result: unknown) => void;
  onToolApproval?: (toolName: string, args: Record<string, unknown>) => Promise<ApprovalDecision>;
}

// In runAgentTurn:
const effectivePrompt = systemPrompt ?? buildSystemPrompt(options.skills);
// ...
tools: getBuiltinTools({
  fetchFn: getRestrictedFetch(),
  defaultHeaders: options.defaultHeaders,
  skills: options.skills,
  skillsDir: options.skillsDir,
}),
```

- [ ] **Step 5: Pass skills from app.ts → chat.ts → runAgentTurn**

`src/cli/app.ts`:

```typescript
await startChat(opts.session, config.security.defaultHeaders, config.skills, config.skillsDir);
```

`src/cli/chat.ts`:

```typescript
import type { SkillConfig } from '../skills/types.js';

export async function startChat(
  sessionId?: string,
  defaultHeaders?: Record<string, Record<string, string>>,
  skills?: SkillConfig[],
  skillsDir?: string,
): Promise<void> {
  // ...
  const result = await runAgentTurn({
    messages,
    defaultHeaders,
    skills,
    skillsDir,
    // ...
  });
```

- [ ] **Step 6: Update src/index.ts**

```typescript
export { loadSkillContent, listSkills } from './skills/loader.js';
export type { SkillConfig } from './skills/types.js';
export { createUseSkillTool } from './tools/use-skill.js';
export { buildSystemPrompt } from './agent/types.js';
```

- [ ] **Step 7: Run all tests and build**

```bash
pnpm test && pnpm build
```

Expected: All tests PASS, build succeeds

- [ ] **Step 8: Commit**

```bash
git add src/config/schema.ts src/tools/registry.ts src/agent/types.ts src/agent/loop.ts src/cli/app.ts src/cli/chat.ts src/index.ts
git commit -m "feat: integrate skills into config, registry, and system prompt"
```

---

### Task 4: Example Skill and Config Update

**Files:**
- Create: `skills/failure-analysis/skill.md`
- Modify: `privateclaw.config.example.json`

- [ ] **Step 1: Create example skill**

`skills/failure-analysis/skill.md`:

```markdown
# Failure Analysis

서비스 장애나 에러 상황을 분석하는 스킬입니다.

## Workflow

1. 사용자에게 에러 메시지 또는 로그 파일 경로를 확인합니다.
2. 로그 파일이 제공된 경우, `file_read` 도구로 로그를 읽습니다.
3. 로그에서 에러 패턴을 분석합니다:
   - Exception이나 Error 키워드가 있는 라인을 식별합니다.
   - 스택 트레이스가 있으면 최초 발생 지점을 파악합니다.
4. 에러 메시지를 기반으로 원인을 추론합니다:
   - Connection 관련 에러인 경우: 네트워크 또는 서비스 가용성 문제로 판단합니다.
   - Timeout 에러인 경우: 서버 응답 지연 또는 리소스 부족으로 판단합니다.
   - Permission/Auth 에러인 경우: 인증 토큰 만료 또는 권한 설정 문제로 판단합니다.
   - OOM 에러인 경우: 메모리 누수 또는 리소스 제한 초과로 판단합니다.
5. 분석 결과를 다음 형식으로 요약합니다:
   - **에러 유형**: (분류)
   - **근본 원인**: (추정 원인)
   - **영향 범위**: (영향받는 서비스/기능)
   - **권장 조치**: (해결 방안)
```

- [ ] **Step 2: Update example config**

`privateclaw.config.example.json`에 skills 추가:

```json
{
  "provider": {
    "type": "openai",
    "baseURL": "http://localhost:8080/v1",
    "apiKey": "your-api-key",
    "model": "gpt-4o"
  },
  "security": {
    "allowedDomains": ["localhost", "internal.corp.com"],
    "defaultHeaders": {
      "internal.corp.com": {
        "Authorization": "Bearer your-api-token"
      }
    }
  },
  "session": {
    "dbPath": "./privateclaw-sessions.db"
  },
  "skills": [
    {
      "name": "failure-analysis",
      "description": "서비스 장애나 에러 로그를 분석하여 근본 원인과 해결 방안을 제시합니다."
    }
  ],
  "skillsDir": "./skills"
}
```

- [ ] **Step 3: Update README skills section**

README.md의 "구현 예정 기능"에서 Skills를 "주요 기능"으로 이동, 실제 사용법 설명 추가.

- [ ] **Step 4: Commit and push**

```bash
git add skills/ privateclaw.config.example.json README.md
git commit -m "feat: add example failure-analysis skill and update docs"
git push
```
