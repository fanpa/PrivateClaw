# create_skill Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `create_skill` tool that lets the LLM create new skills by writing `skill.md` files and registering them in `privateclaw.config.json`, so users can interactively build skills through conversation.

**Architecture:** New tool `create_skill` takes name, description, and content — atomically creates the skill directory + markdown file and appends the skill entry to the config JSON. The tool is always available (not gated behind existing skills). After creation, the new skill is immediately usable via `use_skill` on next `/reload`.

**Tech Stack:** TypeScript, Zod, Node.js fs, Vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/tools/create-skill.ts` | Create | `create_skill` tool implementation |
| `tests/tools/create-skill.test.ts` | Create | Unit tests for create_skill |
| `src/tools/registry.ts` | Modify | Register create_skill in tool set |
| `src/agent/types.ts` | Modify | Add create_skill to system prompt |
| `tests/tools/registry-create-skill.test.ts` | Create | Integration test for registry inclusion |

---

### Task 1: Core create_skill Tool

**Files:**
- Create: `src/tools/create-skill.ts`
- Test: `tests/tools/create-skill.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/tools/create-skill.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createCreateSkillTool } from '../../src/tools/create-skill.js';
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = join(import.meta.dirname, '__test_create_skill__');
const TEST_SKILLS_DIR = join(TEST_DIR, 'skills');
const TEST_CONFIG_PATH = join(TEST_DIR, 'privateclaw.config.json');

const baseConfig = {
  provider: { type: 'openai', baseURL: 'http://localhost:8080/v1', model: 'gpt-4o' },
  security: { allowedDomains: [], defaultHeaders: {} },
  session: { dbPath: './test.db' },
  skills: [],
  skillsDir: './skills',
};

beforeEach(() => {
  mkdirSync(TEST_SKILLS_DIR, { recursive: true });
  writeFileSync(TEST_CONFIG_PATH, JSON.stringify(baseConfig, null, 2));
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('createCreateSkillTool', () => {
  it('has correct name and description', () => {
    const tool = createCreateSkillTool(TEST_SKILLS_DIR, TEST_CONFIG_PATH);
    expect(tool.name).toBe('create_skill');
    expect(tool.description).toBeDefined();
  });

  it('creates skill.md file in correct directory', async () => {
    const tool = createCreateSkillTool(TEST_SKILLS_DIR, TEST_CONFIG_PATH);
    const result = await tool.execute({
      name: 'log-analysis',
      description: 'Analyze server logs',
      content: '# Log Analysis\n\nAnalyze server logs step by step.',
    });

    expect(result.error).toBeUndefined();
    expect(result.created).toBe(true);

    const skillPath = join(TEST_SKILLS_DIR, 'log-analysis', 'skill.md');
    expect(existsSync(skillPath)).toBe(true);
    expect(readFileSync(skillPath, 'utf-8')).toBe('# Log Analysis\n\nAnalyze server logs step by step.');
  });

  it('registers skill in config.json', async () => {
    const tool = createCreateSkillTool(TEST_SKILLS_DIR, TEST_CONFIG_PATH);
    await tool.execute({
      name: 'log-analysis',
      description: 'Analyze server logs',
      content: '# Log Analysis\n\nWorkflow here.',
    });

    const config = JSON.parse(readFileSync(TEST_CONFIG_PATH, 'utf-8'));
    expect(config.skills).toContainEqual({
      name: 'log-analysis',
      description: 'Analyze server logs',
    });
  });

  it('preserves existing config fields when adding skill', async () => {
    const configWithExisting = {
      ...baseConfig,
      skills: [{ name: 'existing', description: 'An existing skill' }],
    };
    writeFileSync(TEST_CONFIG_PATH, JSON.stringify(configWithExisting, null, 2));

    const tool = createCreateSkillTool(TEST_SKILLS_DIR, TEST_CONFIG_PATH);
    await tool.execute({
      name: 'new-skill',
      description: 'A new skill',
      content: '# New Skill',
    });

    const config = JSON.parse(readFileSync(TEST_CONFIG_PATH, 'utf-8'));
    expect(config.skills).toHaveLength(2);
    expect(config.skills[0]).toEqual({ name: 'existing', description: 'An existing skill' });
    expect(config.skills[1]).toEqual({ name: 'new-skill', description: 'A new skill' });
    expect(config.provider.type).toBe('openai'); // other fields intact
  });

  it('returns error if skill name already exists in config', async () => {
    const configWithExisting = {
      ...baseConfig,
      skills: [{ name: 'dupe', description: 'Existing' }],
    };
    writeFileSync(TEST_CONFIG_PATH, JSON.stringify(configWithExisting, null, 2));

    const tool = createCreateSkillTool(TEST_SKILLS_DIR, TEST_CONFIG_PATH);
    const result = await tool.execute({
      name: 'dupe',
      description: 'Duplicate',
      content: '# Dupe',
    });

    expect(result.error).toContain('already exists');
    expect(result.created).toBeUndefined();
  });

  it('returns error if skill directory already exists on disk', async () => {
    mkdirSync(join(TEST_SKILLS_DIR, 'taken'), { recursive: true });
    writeFileSync(join(TEST_SKILLS_DIR, 'taken', 'skill.md'), '# Taken');

    const tool = createCreateSkillTool(TEST_SKILLS_DIR, TEST_CONFIG_PATH);
    const result = await tool.execute({
      name: 'taken',
      description: 'Already there',
      content: '# Taken Again',
    });

    expect(result.error).toContain('already exists');
  });

  describe('tool object (AI SDK path)', () => {
    it('has inputSchema defined', () => {
      const tool = createCreateSkillTool(TEST_SKILLS_DIR, TEST_CONFIG_PATH);
      expect(tool.tool.inputSchema).toBeDefined();
    });

    it('inputSchema parses valid input', () => {
      const tool = createCreateSkillTool(TEST_SKILLS_DIR, TEST_CONFIG_PATH);
      const schema = tool.tool.inputSchema as import('zod').ZodSchema;
      const parsed = schema.parse({
        name: 'test',
        description: 'Test skill',
        content: '# Test',
      });
      expect(parsed.name).toBe('test');
    });

    it('inputSchema rejects missing fields', () => {
      const tool = createCreateSkillTool(TEST_SKILLS_DIR, TEST_CONFIG_PATH);
      const schema = tool.tool.inputSchema as import('zod').ZodSchema;
      expect(() => schema.parse({ name: 'test' })).toThrow();
      expect(() => schema.parse({})).toThrow();
    });

    it('tool.execute works via AI SDK path', async () => {
      const tool = createCreateSkillTool(TEST_SKILLS_DIR, TEST_CONFIG_PATH);
      const result = await tool.tool.execute(
        { name: 'sdk-test', description: 'SDK test', content: '# SDK' },
        { toolCallId: 'test', messages: [] } as never,
      );
      expect(result.created).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/taeji/Workspace/github/PrivateClaw && npx vitest run tests/tools/create-skill.test.ts`
Expected: FAIL — cannot resolve `../../src/tools/create-skill.js`

- [ ] **Step 3: Implement create_skill tool**

```typescript
// src/tools/create-skill.ts
import { z } from 'zod';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

interface CreateSkillResult {
  created?: boolean;
  skillPath?: string;
  error?: string;
}

const parameters = z.object({
  name: z.string().describe('Skill name (used as folder name, e.g. "log-analysis")'),
  description: z.string().describe('One-line description of what the skill does'),
  content: z.string().describe('Full markdown content for skill.md'),
});

function doCreateSkill(
  name: string,
  description: string,
  content: string,
  skillsDir: string,
  configPath: string,
): CreateSkillResult {
  // Check if skill directory already exists
  const skillDir = join(skillsDir, name);
  if (existsSync(skillDir)) {
    return { error: `Skill "${name}" already exists at ${skillDir}` };
  }

  // Check if skill name already exists in config
  try {
    const raw = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);
    const skills: Array<{ name: string; description: string }> = config.skills ?? [];

    if (skills.some((s) => s.name === name)) {
      return { error: `Skill "${name}" already exists in config` };
    }

    // Create skill directory and file
    mkdirSync(skillDir, { recursive: true });
    const skillPath = join(skillDir, 'skill.md');
    writeFileSync(skillPath, content, 'utf-8');

    // Update config
    skills.push({ name, description });
    config.skills = skills;
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    return { created: true, skillPath };
  } catch (err) {
    return {
      error: `Failed to create skill "${name}": ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function createCreateSkillTool(skillsDir: string, configPath: string) {
  return {
    name: 'create_skill' as const,
    description: 'Create a new skill by writing a skill.md file and registering it in the config.',
    tool: {
      description:
        'Create a new skill. Writes a skill.md file to the skills directory and registers it in privateclaw.config.json. Use this when the user wants to create a new reusable workflow.',
      inputSchema: parameters,
      execute: async (
        { name, description, content }: z.infer<typeof parameters>,
      ): Promise<CreateSkillResult> => {
        return doCreateSkill(name, description, content, skillsDir, configPath);
      },
    },
    execute: async (params: {
      name: string;
      description: string;
      content: string;
    }): Promise<CreateSkillResult> => {
      return doCreateSkill(params.name, params.description, params.content, skillsDir, configPath);
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/taeji/Workspace/github/PrivateClaw && npx vitest run tests/tools/create-skill.test.ts`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/create-skill.ts tests/tools/create-skill.test.ts
git commit -m "feat(tools): add create_skill tool with config registration"
```

---

### Task 2: Register create_skill in Tool Registry

**Files:**
- Modify: `src/tools/registry.ts:1-70`
- Test: `tests/tools/registry-create-skill.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/tools/registry-create-skill.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getBuiltinTools } from '../../src/tools/registry.js';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = join(import.meta.dirname, '__test_registry_cs__');
const TEST_CONFIG = join(TEST_DIR, 'config.json');

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  writeFileSync(TEST_CONFIG, JSON.stringify({ skills: [] }, null, 2));
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('getBuiltinTools includes create_skill', () => {
  it('always includes create_skill when configPath is provided', () => {
    const tools = getBuiltinTools({ configPath: TEST_CONFIG, skillsDir: TEST_DIR });
    expect(tools['create_skill']).toBeDefined();
    expect(tools['create_skill'].execute).toBeTypeOf('function');
  });

  it('does not include create_skill when configPath is not provided', () => {
    const tools = getBuiltinTools({});
    expect(tools['create_skill']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/taeji/Workspace/github/PrivateClaw && npx vitest run tests/tools/registry-create-skill.test.ts`
Expected: FAIL — `create_skill` is undefined

- [ ] **Step 3: Modify registry.ts to include create_skill**

Add import at top of `src/tools/registry.ts`:

```typescript
import { createCreateSkillTool } from './create-skill.js';
```

Add `configPath` to `BuiltinToolsOptions`:

```typescript
export interface BuiltinToolsOptions {
  fetchFn?: typeof globalThis.fetch;
  defaultHeaders?: Record<string, Record<string, string>>;
  skills?: SkillConfig[];
  skillsDir?: string;
  configPath?: string;
  onApproval?: (toolName: string, args: unknown) => Promise<ApprovalDecision>;
  onBeforeToolExecute?: () => Promise<void>;
}
```

Add create_skill registration after the use_skill block (before the approval wrapping):

```typescript
  if (options.configPath) {
    const createSkill = createCreateSkillTool(
      options.skillsDir ?? './skills',
      options.configPath,
    );
    tools[createSkill.name] = createSkill.tool;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/taeji/Workspace/github/PrivateClaw && npx vitest run tests/tools/registry-create-skill.test.ts`
Expected: All 2 tests PASS

- [ ] **Step 5: Run all existing tests to ensure no regressions**

Run: `cd /Users/taeji/Workspace/github/PrivateClaw && npx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/tools/registry.ts tests/tools/registry-create-skill.test.ts
git commit -m "feat(registry): register create_skill tool when configPath is provided"
```

---

### Task 3: Wire configPath Through Agent Loop and CLI

**Files:**
- Modify: `src/agent/loop.ts` — pass `configPath` to `getBuiltinTools`
- Modify: `src/cli/chat.ts` — add `configPath` to `ChatOptions`, pass through to `runAgentTurn`

- [ ] **Step 1: Add configPath to RunAgentTurnOptions in loop.ts**

In `src/agent/loop.ts`, add `configPath` to the options interface and pass it to `getBuiltinTools`:

```typescript
// In the RunAgentTurnOptions interface, add:
  configPath?: string;
```

In the `runAgentTurn` function body, add `configPath` to the `getBuiltinTools` call:

```typescript
    tools: getBuiltinTools({
      fetchFn: getRestrictedFetch(),
      defaultHeaders: options.defaultHeaders,
      skills: options.skills,
      skillsDir: options.skillsDir,
      configPath: options.configPath,
      onApproval: options.onToolApproval,
    }),
```

- [ ] **Step 2: Pass configPath from chat.ts to runAgentTurn**

In the `runAgentTurn` call inside `startChat` (around line 175), add:

```typescript
          configPath: currentOptions.configPath,
```

- [ ] **Step 3: Run all tests**

Run: `cd /Users/taeji/Workspace/github/PrivateClaw && npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/agent/loop.ts src/cli/chat.ts
git commit -m "feat(agent): wire configPath through agent loop to enable create_skill"
```

---

### Task 4: Update System Prompt

**Files:**
- Modify: `src/agent/types.ts:15-43`

- [ ] **Step 1: Add create_skill to the system prompt**

In `src/agent/types.ts`, update `buildSystemPrompt` to always include create_skill in the tool list:

```typescript
export function buildSystemPrompt(skills: SkillConfig[] = []): string {
  let prompt = `You are PrivateClaw, a helpful AI assistant with access to the following tools:

- file_read: Read file contents from a given path
- file_write: Write content to a file at a given path
- bash_exec: Execute a bash command and return the output
- web_fetch: Fetch a URL and return the response body
- api_call: Make an HTTP API call (GET, POST, PATCH, PUT, DELETE) with custom headers and body
- create_skill: Create a new reusable skill by writing a skill.md file and registering it in the config`;

  if (skills.length > 0) {
    prompt += `\n- use_skill: Load a skill document to follow its workflow instructions`;
    prompt += `\n\nAvailable skills:\n${listSkills(skills)}`;
    prompt += `\nWhen a task matches a skill description, use the use_skill tool to load it, then follow its workflow instructions step by step.`;
  }

  prompt += `

When a user asks to create a new skill or workflow, use create_skill. Have a conversation to understand the workflow steps, then generate a complete skill.md document.
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

- [ ] **Step 2: Run all tests**

Run: `cd /Users/taeji/Workspace/github/PrivateClaw && npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/agent/types.ts
git commit -m "feat(prompt): add create_skill to system prompt with usage guidance"
```

---

### Task 5: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add create_skill documentation to README**

Add a section under the existing tools documentation describing `create_skill`:

- What it does: creates skill.md + registers in config atomically
- Usage flow: user describes workflow → LLM asks clarifying questions → LLM calls create_skill → skill is ready after `/reload`
- Example conversation showing interactive skill creation

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add create_skill tool documentation to README"
```
