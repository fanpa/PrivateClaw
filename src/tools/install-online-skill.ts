import { z } from 'zod';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { toRawUrl } from './search-online-skill.js';
import type { SimpleFetchFn } from './search-online-skill.js';
import { defineTool } from './define-tool.js';

interface InstallResult {
  message?: string;
  error?: string;
}

const parameters = z.object({
  name: z.string().describe('Name of the skill to install from the market'),
});

async function doInstall(
  name: string,
  opts: {
    marketUrl: string | undefined;
    branch: string;
    skillsDir: string;
    configPath: string;
    fetchFn: SimpleFetchFn;
  },
): Promise<InstallResult> {
  if (!opts.marketUrl) {
    return { error: 'Skill market URL is not configured. Set skillMarketUrl in config file.' };
  }

  const resolvedDir = resolve(opts.skillsDir);
  const skillDir = join(resolvedDir, name);
  const skillPath = join(skillDir, 'skill.md');

  if (existsSync(skillPath)) {
    return { error: `Skill "${name}" already exists locally. Delete it first to reinstall.` };
  }

  const url = toRawUrl(opts.marketUrl, `${name}/skill.md`, opts.branch);
  const result = await opts.fetchFn(url);

  if (result.error) {
    return { error: `Cannot reach skill market at ${url}: ${result.error}` };
  }
  if (result.status !== undefined && (result.status < 200 || result.status >= 300)) {
    return {
      error:
        `Cannot download skill "${name}" from ${url}: HTTP ${result.status}. ` +
        `Verify the skill exists at that path in the market repository. ` +
        `If the repository is private, use set_header to add an Authorization header for raw.githubusercontent.com.`,
    };
  }
  if (!result.body) {
    return { error: `Skill "${name}" at ${url} returned an empty response.` };
  }

  mkdirSync(skillDir, { recursive: true });
  writeFileSync(skillPath, result.body, 'utf-8');

  try {
    const raw = readFileSync(opts.configPath, 'utf-8');
    const config = JSON.parse(raw);
    const skills: Array<{ name: string; description: string }> = config.skills ?? [];

    if (!skills.some((s) => s.name === name)) {
      const lines = result.body.split('\n').filter((l) => l.trim().length > 0);
      let description = name;
      if (lines.length > 1 && !lines[1].startsWith('#')) {
        description = lines[1].trim();
      } else if (lines.length > 0) {
        description = lines[0].replace(/^#\s*/, '').trim();
      }

      skills.push({ name, description });
      config.skills = skills;
      writeFileSync(opts.configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    }
  } catch {
    // Config update failed — skill is still saved locally
  }

  return { message: `Installed skill "${name}" successfully. Call reload_config to apply.` };
}

export function createInstallOnlineSkillTool(opts: {
  marketUrl: string | undefined;
  branch?: string;
  skillsDir: string;
  configPath: string;
  fetchFn: SimpleFetchFn;
}) {
  const resolved = { ...opts, branch: opts.branch ?? 'main' };
  return defineTool({
    name: 'install_online_skill' as const,
    description: 'Download and install a skill from the online skill market.',
    toolDescription: 'Download a skill from the online market and install it locally. The skill will be saved to the skills directory and registered in config. Use search_online_skill first to find available skills.',
    parameters,
    execute: async ({ name }): Promise<InstallResult> => doInstall(name, resolved),
  });
}
