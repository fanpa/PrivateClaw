# Temperature & Self-Reflection Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Config에서 temperature를 설정하고, LLM 응답 후 self-reflection loop로 응답 품질을 검증/수정할 수 있게 한다.

**Architecture:** Config의 provider에 `temperature`와 `reflectionLoops` 필드를 추가한다. temperature는 `streamText` 호출 시 전달한다. Reflection loop는 에이전트 턴 완료 후, LLM에게 자신의 응답을 검토하라는 메시지를 보내고, 수정이 필요하면 수정된 응답을 반환하는 구조. 이 과정은 사용자에게는 `[reflecting...]` 상태로 표시된다.

**Tech Stack:** TypeScript, Vercel AI SDK, Zod

---

## File Structure

```
변경:
├── src/config/schema.ts          # temperature, reflectionLoops 필드 추가
├── src/agent/loop.ts             # temperature 전달 + reflection loop 구현
├── src/agent/types.ts            # REFLECTION_PROMPT 상수 추가
├── src/cli/chat.ts               # config에서 temperature/reflectionLoops 전달
├── src/cli/app.ts                # config 전달
├── src/cli/renderer.ts           # renderReflecting() 추가
├── src/index.ts                  # export 업데이트
├── tests/agent/loop.test.ts      # reflection loop 테스트 추가
├── privateclaw.config.example.json  # 예시 업데이트
```

---

### Task 1: Config에 temperature, reflectionLoops 추가

**Files:**
- Modify: `src/config/schema.ts`
- Modify: `privateclaw.config.example.json`
- Test: `tests/config/schema.test.ts`

- [ ] **Step 1: Add fields to ProviderSchema**

`src/config/schema.ts` — ProviderSchema에 추가:

```typescript
const ProviderSchema = z.object({
  type: z.enum(['openai', 'anthropic', 'ollama']),
  baseURL: z.string().url(),
  apiKey: z.string().optional(),
  model: z.string(),
  temperature: z.number().min(0).max(2).default(0.7),
  reflectionLoops: z.number().int().min(0).max(5).default(1),
});
```

- [ ] **Step 2: Add test for new defaults**

`tests/config/schema.test.ts`에 추가:

```typescript
  it('defaults temperature to 0.7', () => {
    const config = {
      provider: {
        type: 'ollama',
        baseURL: 'http://localhost:11434/api',
        model: 'llama3.2',
      },
    };
    const result = ConfigSchema.parse(config);
    expect(result.provider.temperature).toBe(0.7);
  });

  it('defaults reflectionLoops to 1', () => {
    const config = {
      provider: {
        type: 'ollama',
        baseURL: 'http://localhost:11434/api',
        model: 'llama3.2',
      },
    };
    const result = ConfigSchema.parse(config);
    expect(result.provider.reflectionLoops).toBe(1);
  });

  it('allows reflectionLoops to be 0 (disabled)', () => {
    const config = {
      provider: {
        type: 'ollama',
        baseURL: 'http://localhost:11434/api',
        model: 'llama3.2',
        reflectionLoops: 0,
      },
    };
    const result = ConfigSchema.parse(config);
    expect(result.provider.reflectionLoops).toBe(0);
  });
```

- [ ] **Step 3: Update example config**

`privateclaw.config.example.json`에 추가:

```json
{
  "provider": {
    "type": "openai",
    "baseURL": "http://localhost:8080/v1",
    "apiKey": "your-api-key",
    "model": "gpt-4o",
    "temperature": 0.3,
    "reflectionLoops": 1
  }
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add temperature and reflectionLoops to config schema"
```

---

### Task 2: Temperature을 streamText에 전달

**Files:**
- Modify: `src/agent/loop.ts`
- Modify: `src/cli/chat.ts`
- Modify: `src/cli/app.ts`

- [ ] **Step 1: Add temperature to RunAgentTurnOptions**

`src/agent/loop.ts`:

```typescript
export interface RunAgentTurnOptions {
  messages: ModelMessage[];
  systemPrompt?: string;
  maxSteps?: number;
  model?: LanguageModel;
  temperature?: number;
  // ... existing fields
}
```

streamText 호출에 temperature 추가:

```typescript
const result = streamText({
  model: model ?? getModel(),
  system: effectivePrompt,
  messages,
  temperature: options.temperature,
  tools: getBuiltinTools({ ... }),
  stopWhen: stepCountIs(maxSteps),
});
```

- [ ] **Step 2: Pass temperature from app.ts → chat.ts → runAgentTurn**

`src/cli/app.ts`:

```typescript
await startChat(opts.session, {
  configPath: opts.config,
  temperature: config.provider.temperature,
  reflectionLoops: config.provider.reflectionLoops,
  // ... existing fields
});
```

`src/cli/chat.ts` — ChatOptions에 추가:

```typescript
export interface ChatOptions {
  configPath?: string;
  temperature?: number;
  reflectionLoops?: number;
  // ... existing fields
}
```

runAgentTurn 호출에 전달:

```typescript
const result = await runAgentTurn({
  messages,
  temperature: currentOptions.temperature,
  // ... existing fields
});
```

- [ ] **Step 3: Run tests**

```bash
pnpm test
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: pass temperature to streamText"
```

---

### Task 3: Self-Reflection Loop 구현

**Files:**
- Modify: `src/agent/types.ts`
- Modify: `src/agent/loop.ts`
- Modify: `src/cli/renderer.ts`
- Modify: `src/cli/chat.ts`
- Test: `tests/agent/loop.test.ts`

- [ ] **Step 1: Add reflection prompt constant**

`src/agent/types.ts`에 추가:

```typescript
export const REFLECTION_PROMPT = `Review your previous response for accuracy and quality:
- Is the information correct and based on actual tool results?
- Did you fabricate any information not returned by tools?
- Is the response clear and well-structured?
- Did you miss anything the user asked for?

If your response was accurate and complete, reply with exactly: [LGTM]
If corrections are needed, provide the corrected response.`;
```

- [ ] **Step 2: Add renderReflecting to renderer**

`src/cli/renderer.ts`에 추가:

```typescript
export function renderReflecting(loop: number): void {
  if (verbose) {
    console.log(chalk.magenta(`\n[reflecting] loop ${loop}...`));
  } else {
    process.stdout.write(chalk.magenta(' [reflecting...] '));
  }
}

export function renderReflectionDone(changed: boolean): void {
  if (verbose) {
    console.log(chalk.magenta(`[reflection] ${changed ? 'response updated' : 'no changes needed'}`));
  }
}
```

- [ ] **Step 3: Implement reflection in agent loop**

`src/agent/loop.ts`에 `reflectOnResponse` 함수 추가:

```typescript
import { generateText } from 'ai';
import { REFLECTION_PROMPT } from './types.js';

async function reflectOnResponse(
  model: LanguageModel,
  messages: ModelMessage[],
  response: string,
  temperature?: number,
): Promise<{ text: string; changed: boolean }> {
  const reflectionMessages: ModelMessage[] = [
    ...messages,
    { role: 'assistant', content: response },
    { role: 'user', content: REFLECTION_PROMPT },
  ];

  const result = await generateText({
    model,
    messages: reflectionMessages,
    temperature,
  });

  const reflectionText = result.text.trim();

  if (reflectionText === '[LGTM]' || reflectionText.includes('[LGTM]')) {
    return { text: response, changed: false };
  }

  return { text: reflectionText, changed: true };
}
```

`RunAgentTurnOptions`에 reflection 관련 필드 추가:

```typescript
export interface RunAgentTurnOptions {
  // ... existing
  reflectionLoops?: number;
  onReflecting?: (loop: number) => void;
  onReflectionDone?: (changed: boolean) => void;
}
```

`runAgentTurn` 함수 끝에 reflection loop 추가:

```typescript
  // After getting fullText and response...

  const loops = options.reflectionLoops ?? 0;
  let finalText = fullText;

  if (loops > 0 && fullText.length > 0) {
    const effectiveModel = model ?? getModel();
    for (let i = 0; i < loops; i++) {
      options.onReflecting?.(i + 1);
      const reflection = await reflectOnResponse(
        effectiveModel,
        messages,
        finalText,
        options.temperature,
      );
      options.onReflectionDone?.(reflection.changed);
      if (!reflection.changed) break;
      finalText = reflection.text;
    }
  }

  return {
    text: finalText,
    responseMessages: response.messages as ModelMessage[],
  };
```

- [ ] **Step 4: Wire reflection callbacks in chat.ts**

```typescript
const result = await runAgentTurn({
  messages,
  temperature: currentOptions.temperature,
  reflectionLoops: currentOptions.reflectionLoops,
  onReflecting: renderReflecting,
  onReflectionDone: renderReflectionDone,
  // ... existing callbacks
});
```

- [ ] **Step 5: Add reflection test**

`tests/agent/loop.test.ts`에 추가:

```typescript
  it('skips reflection when reflectionLoops is 0', async () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Hi' },
    ];

    const result = await runAgentTurn({
      messages,
      model: {} as any,
      reflectionLoops: 0,
    });

    expect(result.text).toBe('Hello, world!');
  });
```

- [ ] **Step 6: Run tests and build**

```bash
pnpm test && pnpm build
```

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: add self-reflection loop for response quality"
```

---

### Task 4: README 업데이트

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add temperature and reflection docs**

"주요 기능" 섹션에 추가:

```markdown
### 응답 품질 관리

LLM 응답의 정확성을 높이기 위한 설정을 제공합니다.

- `temperature`: LLM의 창의성 수준 조절 (0.0~2.0, 기본값: 0.7). 낮을수록 보수적.
- `reflectionLoops`: 응답 후 자기 검증 횟수 (기본값: 1). 0이면 비활성화.

Self-reflection loop는 LLM이 자신의 응답을 검토하여, 정보를 날조하지 않았는지,
사용자의 질문에 정확히 답했는지 확인합니다. 120B 이상의 모델에서 효과적입니다.
```

설정 섹션의 예시 config 업데이트:

```json
{
  "provider": {
    "type": "ollama",
    "baseURL": "http://localhost:11434/api",
    "model": "llama3.2",
    "temperature": 0.3,
    "reflectionLoops": 1
  }
}
```

- [ ] **Step 2: Commit and push**

```bash
git add -A
git commit -m "docs: add temperature and reflection loop to README"
git push
```
