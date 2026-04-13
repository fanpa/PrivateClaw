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
  'drm-document-reader': {
    description: 'DRM이 적용된 Excel, PowerPoint, Word 문서를 Windows PowerShell COM Automation으로 읽는 스킬',
    content: [
      '# DRM Document Reader',
      '',
      'DRM이 적용된 Excel, PowerPoint, Word 문서를 Windows PowerShell COM Automation으로 읽는 스킬입니다.',
      'Office 애플리케이션이 백그라운드에서 실행되어 DRM 에이전트가 복호화를 허용합니다.',
      '',
      '> **주의:** Windows에서만 동작합니다. Microsoft Office가 설치되어 있어야 합니다.',
      '',
      '## Workflow',
      '',
      '### Excel (.xlsx, .xls)',
      '',
      '1. 먼저 시트 목록을 조회합니다:',
      '```',
      "shell_exec: $excel = New-Object -ComObject Excel.Application; $excel.Visible = $false; $excel.DisplayAlerts = $false; $wb = $excel.Workbooks.Open('FILE_PATH'); $wb.Sheets | ForEach-Object { $_.Name }; $wb.Close($false); $excel.Quit(); [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null",
      '```',
      '',
      '2. 사용자에게 시트 목록을 보여주고 어떤 시트를 읽을지 확인합니다.',
      '',
      '3. 선택된 시트의 데이터를 읽습니다 (UsedRange, 최대 100행).',
      '',
      '4. 100행을 초과하는 경우, 사용자에게 추가 데이터가 필요한지 확인 후 범위를 지정하여 추가로 읽습니다.',
      '',
      '### PowerPoint (.pptx, .ppt)',
      '',
      '1. 슬라이드 수를 확인하고 텍스트를 추출합니다 (COM Automation).',
      '',
      '### Word (.docx, .doc)',
      '',
      '1. 문서 텍스트를 읽습니다 (최대 5000자, 초과 시 truncate).',
      '',
      '### 이미지 추출',
      '',
      '문서에 포함된 이미지를 임시 폴더에 저장할 수 있습니다. 추출된 이미지는 OCR 스킬과 연계하여 텍스트로 변환할 수 있습니다.',
      '',
      '## 주의사항',
      '',
      '- FILE_PATH는 반드시 절대 경로를 사용하세요',
      '- COM 객체는 반드시 ReleaseComObject로 해제하세요',
      '- 대용량 파일은 범위를 지정하여 단계적으로 읽으세요',
      '- DRM 에이전트가 설치된 환경에서만 DRM 문서를 열 수 있습니다',
      '',
    ].join('\n'),
  },
  'ocr': {
    description: '이미지 파일에서 텍스트를 추출하는 OCR 스킬 (외부 API 사용)',
    content: [
      '# OCR (Optical Character Recognition)',
      '',
      '이미지 파일에서 텍스트를 추출하는 스킬입니다. 외부 OCR API를 사용합니다.',
      '',
      '## 사전 준비',
      '',
      '사용자에게 OCR API 정보를 확인합니다:',
      '1. **API Endpoint URL**',
      '2. **인증 방식** (API Key, Bearer Token 등)',
      '3. **요청 형식** (multipart/form-data 또는 base64 JSON)',
      '',
      '## Workflow',
      '',
      '### 방식 1: multipart/form-data',
      '',
      'api_call 도구로 이미지 파일을 OCR API에 업로드합니다.',
      '',
      '### 방식 2: base64 JSON',
      '',
      'shell_exec로 이미지를 base64 인코딩한 후 api_call로 전송합니다.',
      '',
      '### 방식 3: Google Cloud Vision API',
      '',
      'Google Cloud Vision API의 TEXT_DETECTION 기능을 사용합니다.',
      '',
      '## 주의사항',
      '',
      '- OCR API endpoint는 allowedDomains에 등록되어 있어야 합니다',
      '- 인증이 필요한 경우 defaultHeaders에 API 키를 설정하세요',
      '',
    ].join('\n'),
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
    const configDir = dirname(configPath);
    if (configDir !== '.') {
      mkdirSync(configDir, { recursive: true });
    }
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
    const configDir = dirname(configPath);
    if (configDir !== '.') {
      mkdirSync(configDir, { recursive: true });
    }
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
