import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SkillConfig, SkillIndexEntry } from '../skills/types.js';
import { compareVersions } from '../skills/version.js';

export type InstallAction = 'install' | 'update' | 'skip';

export interface InstallPlanNode {
  name: string;
  action: InstallAction;
  localVersion?: string;
  remoteVersion?: string;
  description: string;
}

export type PlanResult =
  | { ok: true; plan: InstallPlanNode[] }
  | { ok: false; error: string };

interface PlanInputs {
  target: string;
  marketEntries: readonly SkillIndexEntry[];
  localSkills: readonly SkillConfig[];
  skillsDir: string;
}

/**
 * Resolve the installation order for a target skill and its transitive
 * dependencies. Uses DFS with a grey/black visited set so cycles are caught
 * before any I/O runs. The returned plan is topologically sorted — deps
 * appear before their dependents, so the caller can just iterate.
 *
 * Each node's action reflects what should happen when the installer runs:
 *   - install: no local copy yet
 *   - update:  remote version strictly greater than local
 *   - skip:    local copy is already at-or-beyond remote (or versions can't
 *              be compared, in which case we default to "respect local")
 */
export function buildInstallPlan(inputs: PlanInputs): PlanResult {
  const entryMap = new Map<string, SkillIndexEntry>();
  for (const e of inputs.marketEntries) entryMap.set(e.name, e);

  const localMap = new Map<string, SkillConfig>();
  for (const s of inputs.localSkills) localMap.set(s.name, s);

  const done = new Set<string>();
  const onStack = new Set<string>();
  const plan: InstallPlanNode[] = [];

  function visit(name: string, path: readonly string[]): { ok: true } | { ok: false; error: string } {
    if (onStack.has(name)) {
      return {
        ok: false,
        error: `Circular dependency detected: ${[...path, name].join(' → ')}`,
      };
    }
    if (done.has(name)) return { ok: true };

    const entry = entryMap.get(name);
    if (!entry) {
      const from = path.length > 0 ? ` (required by ${path[path.length - 1]})` : '';
      return { ok: false, error: `Missing skill "${name}" in market index${from}.` };
    }

    onStack.add(name);
    for (const dep of entry.dependencies) {
      const res = visit(dep, [...path, name]);
      if (!res.ok) return res;
    }
    onStack.delete(name);
    done.add(name);

    const local = localMap.get(name);
    const onDisk = existsSync(join(inputs.skillsDir, name, 'skill.md'));

    let action: InstallAction;
    if (!onDisk) {
      action = 'install';
    } else if (entry.version && local?.version && compareVersions(entry.version, local.version) > 0) {
      action = 'update';
    } else {
      action = 'skip';
    }

    plan.push({
      name,
      action,
      localVersion: local?.version,
      remoteVersion: entry.version,
      description: entry.description,
    });

    return { ok: true };
  }

  const res = visit(inputs.target, []);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, plan };
}

export function formatInstallSummary(target: string, plan: readonly InstallPlanNode[]): string {
  const installed = plan.filter((n) => n.action === 'install');
  const updated = plan.filter((n) => n.action === 'update');
  const skipped = plan.filter((n) => n.action === 'skip');

  const lines: string[] = [];
  const describe = (n: InstallPlanNode): string =>
    n.remoteVersion ? `${n.name} v${n.remoteVersion}` : n.name;

  if (installed.length > 0) {
    const names = installed.map(describe).join(', ');
    lines.push(`Installed: ${names}`);
  }
  if (updated.length > 0) {
    const names = updated
      .map((n) => `${n.name} ${n.localVersion ? `v${n.localVersion} → ` : ''}v${n.remoteVersion ?? '?'}`)
      .join(', ');
    lines.push(`Updated: ${names}`);
  }
  if (skipped.length > 0) {
    const names = skipped.map(describe).join(', ');
    lines.push(`Up-to-date (skipped): ${names}`);
  }

  if (lines.length === 0) return `Nothing to do for "${target}".`;
  return `Install "${target}" summary — ${lines.join(' | ')}`;
}
