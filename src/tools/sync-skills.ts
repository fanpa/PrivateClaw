import { z } from 'zod';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

interface SyncResult {
  added: string[];
  orphaned: string[];
  removed: string[];
  message: string;
}

const parameters = z.object({
  removeOrphaned: z.boolean().optional().describe(
    'If true, remove skills from config that no longer exist in the skills directory. Only set this to true after confirming with the user.',
  ),
});

function extractDescription(skillPath: string, fallback: string): string {
  try {
    const content = readFileSync(skillPath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length > 1 && !lines[1].startsWith('#')) {
      return lines[1].trim();
    }
    if (lines.length > 0) {
      return lines[0].replace(/^#\s*/, '').trim();
    }
  } catch {
    // fall through
  }
  return fallback;
}

function doSync(configPath: string, skillsDir: string, removeOrphaned: boolean): SyncResult {
  const raw = readFileSync(configPath, 'utf-8');
  const config = JSON.parse(raw);
  const skills: Array<{ name: string; description: string }> = config.skills ?? [];
  const registeredNames = new Set(skills.map((s) => s.name));

  const resolvedDir = resolve(skillsDir);
  const dirNames = new Set<string>();

  if (existsSync(resolvedDir)) {
    try {
      const entries = readdirSync(resolvedDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          const skillPath = join(resolvedDir, e.name, 'skill.md');
          if (existsSync(skillPath)) {
            dirNames.add(e.name);
          }
        }
      }
    } catch {
      // directory not readable
    }
  }

  // Find new skills (in directory but not in config)
  const added: string[] = [];
  for (const name of dirNames) {
    if (!registeredNames.has(name)) {
      const skillPath = join(resolvedDir, name, 'skill.md');
      const description = extractDescription(skillPath, name);
      skills.push({ name, description });
      added.push(name);
    }
  }

  // Find orphaned skills (in config but not in directory)
  const orphaned: string[] = [];
  const removed: string[] = [];
  for (const s of skills) {
    if (!dirNames.has(s.name)) {
      orphaned.push(s.name);
    }
  }

  if (removeOrphaned && orphaned.length > 0) {
    config.skills = skills.filter((s) => dirNames.has(s.name));
    removed.push(...orphaned);
  } else {
    config.skills = skills;
  }

  if (added.length > 0 || removed.length > 0) {
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  }

  const parts: string[] = [];
  if (added.length > 0) parts.push(`Added: ${added.join(', ')}`);
  if (orphaned.length > 0 && !removeOrphaned) {
    parts.push(`Orphaned (in config but not in directory): ${orphaned.join(', ')}. Ask the user if they want to remove these, then call sync_skills with removeOrphaned=true.`);
  }
  if (removed.length > 0) parts.push(`Removed: ${removed.join(', ')}`);
  if (parts.length === 0) parts.push('All skills are in sync.');

  return { added, orphaned: removeOrphaned ? [] : orphaned, removed, message: parts.join(' | ') };
}

export function createSyncSkillsTool(configPath: string, skillsDir: string) {
  return {
    name: 'sync_skills' as const,
    description: 'Synchronize skills between the skills directory and config file.',
    tool: {
      description:
        'Scan the skills directory and compare with config. New skills in the directory are registered. Skills in config but missing from the directory are reported as orphaned. Set removeOrphaned=true to delete orphaned entries (ask the user first).',
      inputSchema: parameters,
      execute: async (args: z.infer<typeof parameters>): Promise<SyncResult> => {
        return doSync(configPath, skillsDir, args.removeOrphaned ?? false);
      },
    },
    execute: async (params: { removeOrphaned?: boolean }): Promise<SyncResult> => {
      return doSync(configPath, skillsDir, params.removeOrphaned ?? false);
    },
  };
}
