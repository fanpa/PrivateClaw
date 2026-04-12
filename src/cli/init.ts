import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import * as readline from 'node:readline';

const DEFAULT_CONFIG = {
  provider: {
    type: 'openai' as string,
    baseURL: '' as string | undefined,
    apiKey: '' as string | undefined,
    model: '',
    temperature: 0.7,
    reflectionLoops: 2,
  },
  security: {
    allowedDomains: [] as string[],
    allowedCommands: [],
    defaultHeaders: {},
  },
  session: {
    sessionDir: './.privateclaw/sessions',
    maxHistoryMessages: 20,
  },
  skills: [] as Array<{ name: string; description: string }>,
  skillsDir: './skills',
  specialists: [] as Array<{ role: string; type: string; baseURL?: string; apiKey?: string; model: string; description: string }>,
};

const DEFAULT_SKILLS: Record<string, { description: string; content: string }> = {
  'failure-analysis': {
    description: '���비스 장애나 에러 로그를 분석하여 근본 원인�� 해결 방안을 제시합니다.',
    content: `# Failure Analysis

서비스 장애나 에러 상황��� 분석하는 스킬입니��.

## Workflow

1. 사용자에게 에러 메시지 또는 로그 파일 경���를 확인합니다.
2. ��그 파일이 제공된 경우, \`file_read\` 도구로 로그를 읽습니다.
3. 에러 패턴을 분석하고 원인을 추론합니다.
4. 분석 결과를 에러 유형, 근본 원인, 영향 범위, 권장 조치 형식으로 요약���니다.
`,
  },
};

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

/**
 * Extract parameter size from model name (e.g., "120b", "70b", "7b").
 * Returns 0 if no size found.
 */
function extractModelSize(modelName: string): number {
  const match = modelName.match(/(\d+\.?\d*)b/i);
  return match ? parseFloat(match[1]) : 0;
}

/**
 * Infer specialist role from model name.
 */
function inferRole(modelName: string): string {
  const lower = modelName.toLowerCase();
  if (lower.includes('code') || lower.includes('coder')) return 'coding';
  if (lower.includes('math')) return 'math';
  return 'reasoning';
}

interface ModelInfo {
  id: string;
  size: number;
}

/**
 * Fetch available models from an OpenAI-compatible /models endpoint.
 */
async function fetchModels(baseURL: string): Promise<ModelInfo[]> {
  // Try OpenAI-compatible /models endpoint
  const urls = [
    `${baseURL.replace(/\/$/, '')}/models`,
    `${baseURL.replace(/\/v1\/?$/, '')}/v1/models`,
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const data = await response.json() as { data?: Array<{ id: string }> };
      if (data.data && Array.isArray(data.data)) {
        return data.data.map((m) => ({
          id: m.id,
          size: extractModelSize(m.id),
        }));
      }
    } catch {
      continue;
    }
  }

  return [];
}

/**
 * Detect provider type from base URL.
 */
function detectProviderType(baseURL: string): string {
  const lower = baseURL.toLowerCase();
  if (lower.includes('anthropic')) return 'anthropic';
  if (lower.includes('googleapis') || lower.includes('generativelanguage')) return 'google';
  if (lower.includes('11434')) return 'ollama';
  return 'openai';
}

export function executeInit(configPath: string, skillsDir: string): { created: string[] } {
  const created: string[] = [];

  if (!existsSync(configPath)) {
    mkdirSync(dirname(configPath), { recursive: true });
    const config = {
      ...DEFAULT_CONFIG,
      provider: { ...DEFAULT_CONFIG.provider, baseURL: 'http://localhost:8080/v1', model: 'gpt-4o' },
      security: { ...DEFAULT_CONFIG.security, allowedDomains: ['localhost'] },
    };
    for (const [name, skill] of Object.entries(DEFAULT_SKILLS)) {
      config.skills.push({ name, description: skill.description });
    }
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    created.push(configPath);
  }

  const resolvedSkillsDir = resolve(skillsDir);
  mkdirSync(resolvedSkillsDir, { recursive: true });

  for (const [name, skill] of Object.entries(DEFAULT_SKILLS)) {
    const skillDir = join(resolvedSkillsDir, name);
    const skillPath = join(skillDir, 'skill.md');
    if (!existsSync(skillPath)) {
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(skillPath, skill.content, 'utf-8');
      created.push(skillPath);
    }
  }

  return { created };
}

/**
 * Interactive initialization — prompts user for LLM endpoint,
 * auto-detects provider, discovers models, selects main + specialists.
 */
export async function executeInteractiveInit(configPath: string, skillsDir: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log('\n🔧 PrivateClaw Setup\n');

    // 1. Ask for base URL
    const baseURL = await ask(rl, 'LLM API Base URL (e.g., http://localhost:11434/v1): ');
    if (!baseURL.trim()) {
      console.log('Base URL is required. Exiting.');
      return;
    }

    const trimmedURL = baseURL.trim();

    // 2. Ask for API key (optional)
    const apiKey = await ask(rl, 'API Key (press Enter to skip): ');

    // 3. Detect provider type
    const providerType = detectProviderType(trimmedURL);
    console.log(`\nDetected provider: ${providerType}`);

    // 4. Extract domain and add to allowedDomains
    let hostname: string;
    try {
      hostname = new URL(trimmedURL).hostname;
    } catch {
      console.log('Invalid URL format. Exiting.');
      return;
    }

    // 5. Fetch available models
    console.log('Fetching available models...');
    const models = await fetchModels(trimmedURL);

    let mainModel = '';
    const specialists: typeof DEFAULT_CONFIG.specialists = [];

    if (models.length > 0) {
      console.log(`\nFound ${models.length} models:`);

      // Sort by size descending
      const sorted = [...models].sort((a, b) => b.size - a.size);
      for (const m of sorted) {
        const sizeLabel = m.size > 0 ? ` (${m.size}B)` : '';
        console.log(`  ${m.id}${sizeLabel}`);
      }

      // Auto-select largest as main model
      const largest = sorted[0];
      mainModel = largest.id;
      console.log(`\n→ Main model (largest): ${mainModel}`);

      // Register others as specialists
      for (const m of sorted.slice(1)) {
        if (m.id === mainModel) continue;
        const role = inferRole(m.id);
        specialists.push({
          role: `${role}-${m.id.replace(/[/:]/g, '-')}`,
          type: providerType,
          baseURL: trimmedURL,
          apiKey: apiKey.trim() || undefined,
          model: m.id,
          description: `${role} specialist (${m.id})`,
        });
      }

      if (specialists.length > 0) {
        console.log(`→ Specialists: ${specialists.map((s) => s.model).join(', ')}`);
      }
    } else {
      console.log('Could not fetch models. Please enter the model name manually.');
      mainModel = await ask(rl, 'Model name: ');
      if (!mainModel.trim()) {
        console.log('Model name is required. Exiting.');
        return;
      }
      mainModel = mainModel.trim();
    }

    // 6. Build config
    const config = {
      ...DEFAULT_CONFIG,
      provider: {
        type: providerType,
        baseURL: trimmedURL,
        apiKey: apiKey.trim() || undefined,
        model: mainModel,
        temperature: 0.7,
        reflectionLoops: 2,
      },
      security: {
        ...DEFAULT_CONFIG.security,
        allowedDomains: [hostname],
      },
      specialists,
    };

    // Add default skills
    for (const [name, skill] of Object.entries(DEFAULT_SKILLS)) {
      config.skills.push({ name, description: skill.description });
    }

    // 7. Write config
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    console.log(`\n✓ Config saved to ${configPath}`);

    // 8. Create default skills
    const resolvedSkillsDir = resolve(skillsDir);
    mkdirSync(resolvedSkillsDir, { recursive: true });
    for (const [name, skill] of Object.entries(DEFAULT_SKILLS)) {
      const skillDir = join(resolvedSkillsDir, name);
      const skillPath = join(skillDir, 'skill.md');
      if (!existsSync(skillPath)) {
        mkdirSync(skillDir, { recursive: true });
        writeFileSync(skillPath, skill.content, 'utf-8');
        console.log(`✓ Skill created: ${skillPath}`);
      }
    }

    console.log('\n✓ Setup complete! Run "privateclaw" to start chatting.\n');
  } finally {
    rl.close();
  }
}

/**
 * Scan skillsDir for unregistered skills and auto-register them in config.
 */
export function autoRegisterSkills(configPath: string, skillsDir: string): string[] {
  if (!existsSync(configPath)) return [];

  const raw = readFileSync(configPath, 'utf-8');
  const config = JSON.parse(raw);
  const skills: Array<{ name: string; description: string }> = config.skills ?? [];
  const registeredNames = new Set(skills.map((s) => s.name));

  const resolvedDir = resolve(skillsDir);
  if (!existsSync(resolvedDir)) return [];

  let entries: string[];
  try {
    entries = readdirSync(resolvedDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }

  const newSkills: string[] = [];

  for (const dirName of entries) {
    if (registeredNames.has(dirName)) continue;

    const skillPath = join(resolvedDir, dirName, 'skill.md');
    if (!existsSync(skillPath)) continue;

    let description = dirName;
    try {
      const content = readFileSync(skillPath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      if (lines.length > 1 && !lines[1].startsWith('#')) {
        description = lines[1].trim();
      } else if (lines.length > 0) {
        description = lines[0].replace(/^#\s*/, '').trim();
      }
    } catch {
      // keep folder name as description
    }

    skills.push({ name: dirName, description });
    newSkills.push(dirName);
  }

  if (newSkills.length > 0) {
    config.skills = skills;
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  }

  return newSkills;
}
