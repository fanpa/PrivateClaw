import { z } from 'zod';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseSkillIndex, toRawUrl } from './search-online-skill.js';
import type { SimpleFetchFn, SimpleFetchResult } from './search-online-skill.js';
import { buildInstallPlan, formatInstallSummary } from './install-plan.js';
import type { InstallPlanNode } from './install-plan.js';
import type { SkillConfig, SkillIndexEntry } from '../skills/types.js';
import { defineTool } from './define-tool.js';

interface InstalledEntry {
  name: string;
  version?: string;
  action: 'install' | 'update' | 'skip';
}

interface InstallResult {
  message?: string;
  installed?: InstalledEntry[];
  skipped?: InstalledEntry[];
  error?: string;
}

const parameters = z.object({
  name: z.string().describe('Name of the skill to install from the market'),
});

interface InstallOpts {
  marketUrl: string | undefined;
  branch: string;
  skillsDir: string;
  configPath: string;
  fetchFn: SimpleFetchFn;
  onReload?: () => Promise<string | null>;
}

function readConfigSkills(configPath: string): SkillConfig[] {
  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as { skills?: SkillConfig[] };
    return Array.isArray(parsed.skills) ? parsed.skills : [];
  } catch {
    return [];
  }
}

function writeConfigSkills(configPath: string, updater: (skills: SkillConfig[]) => SkillConfig[]): void {
  const raw = readFileSync(configPath, 'utf-8');
  const config = JSON.parse(raw) as Record<string, unknown>;
  const current = Array.isArray(config.skills) ? (config.skills as SkillConfig[]) : [];
  config.skills = updater(current);
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

function upsertSkillEntry(
  skills: SkillConfig[],
  name: string,
  description: string,
  version: string | undefined,
): SkillConfig[] {
  const next = skills.filter((s) => s.name !== name);
  const entry: SkillConfig = { name, description };
  if (version) entry.version = version;
  next.push(entry);
  return next;
}

function formatHttpError(kind: string, name: string, url: string, detail: string): string {
  return (
    `${kind} skill "${name}" from ${url}: ${detail}. ` +
    `Verify the skill exists at that path in the market repository. ` +
    `If the repository is private, use set_header to add an Authorization header for raw.githubusercontent.com.`
  );
}

async function fetchIndex(opts: InstallOpts): Promise<{ entries?: SkillIndexEntry[]; error?: string }> {
  const indexUrl = toRawUrl(opts.marketUrl!, 'index.md', opts.branch);
  const result = await opts.fetchFn(indexUrl);
  if (result.error) {
    return { error: `Cannot reach skill market at ${indexUrl}: ${result.error}` };
  }
  if (result.status !== undefined && (result.status < 200 || result.status >= 300)) {
    return { error: `Cannot reach skill market at ${indexUrl}: HTTP ${result.status}.` };
  }
  if (!result.body) {
    return { error: `Skill market at ${indexUrl} returned an empty response.` };
  }
  return { entries: parseSkillIndex(result.body) };
}

async function fetchSkillBody(
  opts: InstallOpts,
  name: string,
): Promise<{ body?: string; error?: string; url: string }> {
  const url = toRawUrl(opts.marketUrl!, `${name}/skill.md`, opts.branch);
  const result: SimpleFetchResult = await opts.fetchFn(url);
  if (result.error) {
    return { error: formatHttpError('Cannot download', name, url, result.error), url };
  }
  if (result.status !== undefined && (result.status < 200 || result.status >= 300)) {
    return { error: formatHttpError('Cannot download', name, url, `HTTP ${result.status}`), url };
  }
  if (!result.body) {
    return { error: `Skill "${name}" at ${url} returned an empty response.`, url };
  }
  return { body: result.body, url };
}

async function doInstall(name: string, opts: InstallOpts): Promise<InstallResult> {
  if (!opts.marketUrl) {
    return { error: 'Skill market URL is not configured. Set skillMarketUrl in config file.' };
  }

  const indexFetch = await fetchIndex(opts);
  if (indexFetch.error) return { error: indexFetch.error };

  const resolvedDir = resolve(opts.skillsDir);
  const localSkills = readConfigSkills(opts.configPath);
  const plan = buildInstallPlan({
    target: name,
    marketEntries: indexFetch.entries!,
    localSkills,
    skillsDir: resolvedDir,
  });
  if (!plan.ok) return { error: plan.error };

  // Execute plan in topological order — deps first, target last. Abort on the
  // first failed download so we don't leave a half-installed graph on disk.
  const installed: InstallPlanNode[] = [];
  const skipped: InstallPlanNode[] = [];

  for (const node of plan.plan) {
    if (node.action === 'skip') {
      skipped.push(node);
      continue;
    }

    const fetched = await fetchSkillBody(opts, node.name);
    if (fetched.error) {
      return { error: fetched.error };
    }

    const skillDir = join(resolvedDir, node.name);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'skill.md'), fetched.body!, 'utf-8');
    installed.push(node);
  }

  if (installed.length > 0) {
    try {
      writeConfigSkills(opts.configPath, (current) => {
        let next = current;
        for (const node of installed) {
          next = upsertSkillEntry(next, node.name, node.description, node.remoteVersion);
        }
        return next;
      });
    } catch {
      // Config write failed — skill files are still on disk. Leave the
      // rest to sync_skills / manual fix; don't roll back the files.
    }
  }

  // Auto-reload so later turns (and the rest of this turn's system prompt,
  // when next turn starts) pick up the new skills without the user needing
  // to tell the model to call reload_config.
  let reloadError: string | null = null;
  if (installed.length > 0 && opts.onReload) {
    try {
      reloadError = await opts.onReload();
    } catch (err) {
      reloadError = err instanceof Error ? err.message : String(err);
    }
  }

  const toEntry = (n: InstallPlanNode): InstalledEntry => ({
    name: n.name,
    version: n.remoteVersion,
    action: n.action,
  });

  return {
    message:
      formatInstallSummary(name, plan.plan) +
      (reloadError ? ` (reload warning: ${reloadError})` : installed.length > 0 ? ' — config reloaded' : ''),
    installed: installed.map(toEntry),
    skipped: skipped.map(toEntry),
  };
}

export function createInstallOnlineSkillTool(opts: {
  marketUrl: string | undefined;
  branch?: string;
  skillsDir: string;
  configPath: string;
  fetchFn: SimpleFetchFn;
  onReload?: () => Promise<string | null>;
}) {
  const resolved: InstallOpts = { ...opts, branch: opts.branch ?? 'main' };
  return defineTool({
    name: 'install_online_skill' as const,
    description: 'Download and install a skill from the online skill market, including any declared dependencies.',
    toolDescription:
      'Download a skill from the online market and install it locally. Dependencies declared in the market index are installed automatically in topological order. If a skill is already present locally at the same or higher version, it is left alone. If the market carries a newer version, the local copy is overwritten. The config file is reloaded automatically after a successful install.',
    parameters,
    execute: async ({ name }): Promise<InstallResult> => doInstall(name, resolved),
  });
}
