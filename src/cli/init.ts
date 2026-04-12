import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

const DEFAULT_CONFIG = {
  provider: {
    type: 'openai',
    baseURL: 'http://localhost:8080/v1',
    apiKey: 'your-api-key',
    model: 'gpt-4o',
    temperature: 0.7,
    reflectionLoops: 2,
  },
  security: {
    allowedDomains: ['localhost'],
    allowedCommands: [],
    defaultHeaders: {},
  },
  session: {
    sessionDir: './.privateclaw/sessions',
    maxHistoryMessages: 20,
  },
  skills: [] as Array<{ name: string; description: string }>,
  skillsDir: './skills',
  specialists: [],
};

const DEFAULT_SKILLS: Record<string, { description: string; content: string }> = {
  'failure-analysis': {
    description: '서비스 장애나 에러 로그를 분석하여 근본 원인과 해결 방안을 제시합니다.',
    content: `# Failure Analysis

서비스 장애나 에러 상황을 분석하는 스킬입니다.

## Workflow

1. 사용자에게 에러 메시지 또는 로그 파일 경로를 확인합니다.
2. 로그 파일이 제공된 경우, \`file_read\` 도구로 로그를 읽습니다.
3. 에러 패턴을 분석하고 원인을 추론합니다.
4. 분석 결과를 에러 유형, 근본 원인, 영향 범위, 권장 조치 형식으로 요약합니다.
`,
  },
};

export function executeInit(configPath: string, skillsDir: string): { created: string[] } {
  const created: string[] = [];

  // Create config file if not exists
  if (!existsSync(configPath)) {
    mkdirSync(dirname(configPath), { recursive: true });
    const config = { ...DEFAULT_CONFIG };
    for (const [name, skill] of Object.entries(DEFAULT_SKILLS)) {
      config.skills.push({ name, description: skill.description });
    }
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    created.push(configPath);
  }

  // Create skills directory and default skills
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
 * Scan skillsDir for skill directories containing skill.md
 * that are not registered in config. Auto-registers them.
 * Returns list of newly registered skill names.
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
