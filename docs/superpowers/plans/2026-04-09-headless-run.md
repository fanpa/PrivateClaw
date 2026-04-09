# Headless Run Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `privateclaw run` command that executes a prompt or skill non-interactively (no user input, auto-approve tools), outputs the result to stdout, and exits — enabling cron-based scheduling.

**Architecture:** New `run` subcommand in Commander.js calls `runAgentTurn` with auto-approve callback (always returns `allow_once`). Accepts `--prompt` or `--skill` flag. Streams output to stdout. Exit code 0 on success, 1 on error. No session persistence needed.

**Tech Stack:** TypeScript, Commander.js, Vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/cli/run.ts` | Create | `executeRun()` — headless single-turn execution |
| `tests/cli/run.test.ts` | Create | Unit tests for headless run |
| `src/cli/app.ts` | Modify | Register `run` subcommand |
| `README.md` | Modify | Document `run` command and cron example |

---

### Task 1: Core headless run function

**Files:**
- Create: `src/cli/run.ts`
- Test: `tests/cli/run.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/cli/run.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRunAgentTurn = vi.fn();
vi.mock('../../src/agent/loop.js', () => ({
  runAgentTurn: (...args: unknown[]) => mockRunAgentTurn(...args),
}));

vi.mock('../../src/provider/registry.js', () => ({
  getModel: vi.fn(),
  getRestrictedFetch: vi.fn().mockReturnValue(globalThis.fetch),
}));

vi.mock('../../src/tools/registry.js', () => ({
  getBuiltinTools: vi.fn().mockReturnValue({}),
}));

import { executeRun } from '../../src/cli/run.js';

describe('executeRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls runAgentTurn with the prompt as user message', async () => {
    mockRunAgentTurn.mockResolvedValue({
      text: 'Agent response',
      responseMessages: [],
    });

    const output = await executeRun({
      prompt: 'Hello agent',
      temperature: 0.3,
    });

    expect(mockRunAgentTurn).toHaveBeenCalledTimes(1);
    const callArgs = mockRunAgentTurn.mock.calls[0][0];
    expect(callArgs.messages).toEqual([{ role: 'user', content: 'Hello agent' }]);
    expect(callArgs.temperature).toBe(0.3);
    expect(output).toBe('Agent response');
  });

  it('auto-approves all tool calls', async () => {
    mockRunAgentTurn.mockResolvedValue({
      text: 'done',
      responseMessages: [],
    });

    await executeRun({ prompt: 'do something' });

    const callArgs = mockRunAgentTurn.mock.calls[0][0];
    const decision = await callArgs.onToolApproval('bash_exec', { command: 'rm -rf /' });
    expect(decision).toBe('allow_once');
  });

  it('loads skill content and uses it as prompt when skill option is provided', async () => {
    mockRunAgentTurn.mockResolvedValue({
      text: 'skill result',
      responseMessages: [],
    });

    const output = await executeRun({
      prompt: 'Execute the loaded skill workflow',
      skillName: 'failure-analysis',
      skills: [{ name: 'failure-analysis', description: 'Analyze failures' }],
      skillsDir: './skills',
    });

    expect(output).toBe('skill result');
    const callArgs = mockRunAgentTurn.mock.calls[0][0];
    expect(callArgs.skills).toEqual([{ name: 'failure-analysis', description: 'Analyze failures' }]);
  });

  it('passes defaultHeaders and reflectionLoops', async () => {
    mockRunAgentTurn.mockResolvedValue({
      text: 'ok',
      responseMessages: [],
    });

    await executeRun({
      prompt: 'test',
      reflectionLoops: 2,
      defaultHeaders: { 'api.com': { Authorization: 'Bearer x' } },
    });

    const callArgs = mockRunAgentTurn.mock.calls[0][0];
    expect(callArgs.reflectionLoops).toBe(2);
    expect(callArgs.defaultHeaders).toEqual({ 'api.com': { Authorization: 'Bearer x' } });
  });

  it('returns empty string when agent returns no text', async () => {
    mockRunAgentTurn.mockResolvedValue({
      text: '',
      responseMessages: [],
    });

    const output = await executeRun({ prompt: 'test' });
    expect(output).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/taeji/Workspace/github/PrivateClaw && npx vitest run tests/cli/run.test.ts`
Expected: FAIL — cannot resolve `../../src/cli/run.js`

- [ ] **Step 3: Implement executeRun**

```typescript
// src/cli/run.ts
import type { ModelMessage } from 'ai';
import { runAgentTurn } from '../agent/loop.js';
import type { SkillConfig } from '../skills/types.js';
import { loadSkillContent } from '../skills/loader.js';

export interface RunOptions {
  prompt: string;
  skillName?: string;
  temperature?: number;
  reflectionLoops?: number;
  defaultHeaders?: Record<string, Record<string, string>>;
  skills?: SkillConfig[];
  skillsDir?: string;
}

export async function executeRun(options: RunOptions): Promise<string> {
  const messages: ModelMessage[] = [];

  // If a skill is specified, load it and prepend as system context
  if (options.skillName && options.skillsDir) {
    try {
      const skillContent = loadSkillContent(options.skillName, options.skillsDir);
      messages.push({
        role: 'user',
        content: `Follow this skill workflow:\n\n${skillContent}\n\nNow execute: ${options.prompt}`,
      });
    } catch {
      messages.push({ role: 'user', content: options.prompt });
    }
  } else {
    messages.push({ role: 'user', content: options.prompt });
  }

  const result = await runAgentTurn({
    messages,
    temperature: options.temperature,
    reflectionLoops: options.reflectionLoops,
    defaultHeaders: options.defaultHeaders,
    skills: options.skills,
    skillsDir: options.skillsDir,
    onToolApproval: async () => 'allow_once' as const,
  });

  return result.text;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/taeji/Workspace/github/PrivateClaw && npx vitest run tests/cli/run.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Run full test suite**

Run: `cd /Users/taeji/Workspace/github/PrivateClaw && npx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/cli/run.ts tests/cli/run.test.ts
git commit -m "feat(cli): add headless executeRun function with auto-approve"
```

---

### Task 2: Register `run` command in app.ts

**Files:**
- Modify: `src/cli/app.ts`

- [ ] **Step 1: Add the run subcommand to app.ts**

Add import at top:

```typescript
import { executeRun } from './run.js';
```

Add the `run` command after the `domains` command block (before `return program;`):

```typescript
  program
    .command('run')
    .description('Execute a prompt or skill non-interactively (headless mode)')
    .requiredOption('-c, --config <path>', 'Path to config file', 'privateclaw.config.json')
    .option('-p, --prompt <text>', 'Prompt to execute')
    .option('-s, --skill <name>', 'Skill to execute')
    .option('-v, --verbose', 'Enable verbose output')
    .action(async (opts: { config: string; prompt?: string; skill?: string; verbose?: boolean }) => {
      if (!opts.prompt && !opts.skill) {
        renderError('Either --prompt or --skill is required.');
        process.exit(1);
      }

      try {
        if (opts.verbose) setVerbose(true);
        const config = loadConfig(opts.config);
        initFromConfig(config);

        const prompt = opts.prompt ?? `Execute the "${opts.skill}" skill workflow.`;

        const output = await executeRun({
          prompt,
          skillName: opts.skill,
          temperature: config.provider.temperature,
          reflectionLoops: config.provider.reflectionLoops,
          defaultHeaders: config.security.defaultHeaders,
          skills: config.skills,
          skillsDir: config.skillsDir,
        });

        if (output) {
          process.stdout.write(output + '\n');
        }
      } catch (err) {
        renderError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
```

- [ ] **Step 2: Run full test suite**

Run: `cd /Users/taeji/Workspace/github/PrivateClaw && npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/cli/app.ts
git commit -m "feat(cli): register run subcommand for headless execution"
```

---

### Task 3: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add headless run documentation**

After the `privateclaw domains` line in the CLI usage section, add:

```markdown
privateclaw run -p "프롬프트"    # 비대화형 단일 실행
privateclaw run -s skill-name    # 스킬 기반 실행
```

Add a new section after "채팅 내 명령어":

```markdown
### 비대화형 실행 (Headless Mode)

`privateclaw run` 명령어로 대화 없이 단일 작업을 실행하고 결과를 stdout으로 출력합니다. 모든 도구는 자동 승인됩니다.

\`\`\`bash
# 프롬프트 기반 실행
privateclaw run -p "현재 시스템 상태를 확인해줘"

# 스킬 기반 실행
privateclaw run -s failure-analysis -p "이 로그를 분석해줘: /var/log/app.log"

# 결과를 파이프로 전달
privateclaw run -p "요약해줘" | mail -s "Report" team@company.com
\`\`\`

OS의 cron과 조합하면 자동화된 스케줄링이 가능합니다:

\`\`\`bash
# 매일 오전 9시에 Jira 이슈 정리 후 메일 전송
0 9 * * * cd /path/to/project && privateclaw run -s jira-daily-report | mail -s "Daily Jira Report" team@company.com
\`\`\`

| 옵션 | 설명 |
|------|------|
| `-p, --prompt <text>` | 실행할 프롬프트 |
| `-s, --skill <name>` | 실행할 스킬 이름 |
| `-c, --config <path>` | config 파일 경로 (기본: privateclaw.config.json) |
| `-v, --verbose` | 상세 출력 모드 |
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add headless run mode and cron scheduling documentation"
```
