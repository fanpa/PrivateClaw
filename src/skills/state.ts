export interface ActiveSkillFrame {
  name: string;
  content: string;
  loadedAt: string;
}

export type PushResult =
  | { ok: true; frame: ActiveSkillFrame; duplicated: boolean }
  | { ok: false; error: string };

const DEFAULT_MAX_DEPTH = 5;

export class SkillStateManager {
  private readonly maxDepth: number;
  private stack: ActiveSkillFrame[] = [];

  constructor(maxDepth: number = DEFAULT_MAX_DEPTH) {
    this.maxDepth = Math.max(1, maxDepth);
  }

  push(name: string, content: string): PushResult {
    const existing = this.stack.find((f) => f.name === name);
    if (existing) return { ok: true, frame: existing, duplicated: true };

    if (this.stack.length >= this.maxDepth) {
      return {
        ok: false,
        error: `Skill nesting depth limit (${this.maxDepth}) reached. Call exit_skill to pop the current skill before loading another.`,
      };
    }

    const frame: ActiveSkillFrame = {
      name,
      content,
      loadedAt: new Date().toISOString(),
    };
    this.stack.push(frame);
    return { ok: true, frame, duplicated: false };
  }

  pop(): ActiveSkillFrame | null {
    return this.stack.pop() ?? null;
  }

  clear(): void {
    this.stack = [];
  }

  top(): ActiveSkillFrame | null {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
  }

  frames(): readonly ActiveSkillFrame[] {
    return this.stack;
  }

  names(): string[] {
    return this.stack.map((f) => f.name);
  }

  depth(): number {
    return this.stack.length;
  }

  limit(): number {
    return this.maxDepth;
  }

  /**
   * Restore a stack from persisted skill names. The loader may throw or return
   * null for missing skills — those are silently dropped so a deleted skill
   * file doesn't break session reopen.
   */
  restore(names: readonly string[], loader: (name: string) => string | null): void {
    this.stack = [];
    for (const name of names) {
      if (this.stack.length >= this.maxDepth) break;
      let content: string | null;
      try {
        content = loader(name);
      } catch {
        content = null;
      }
      if (content === null) continue;
      this.stack.push({ name, content, loadedAt: new Date().toISOString() });
    }
  }
}

/**
 * Build the system-prompt addendum for the current skill stack. Only the TOP
 * frame's full content is included to keep the token budget bounded; parent
 * frames are mentioned by name so the LLM knows where exit_skill returns.
 */
export function buildActiveSkillSystemText(stack: readonly ActiveSkillFrame[]): string {
  if (stack.length === 0) return '';

  const top = stack[stack.length - 1];
  const parents = stack.slice(0, -1).map((f) => f.name);

  const header = `═══ ACTIVE SKILL: ${top.name} ═══`;
  const parentLine = parents.length > 0
    ? `Parent stack (return order when exit_skill is called): ${parents.join(' → ')}\n`
    : '';
  const exitTarget = parents.length > 0
    ? `return to "${parents[parents.length - 1]}"`
    : 'end skill mode';

  return [
    '',
    '',
    header,
    parentLine + `Follow this skill's workflow step by step. When ALL steps are done and the user's request is fulfilled, you MUST call exit_skill to ${exitTarget}. Do not skip this — leaving a skill active blocks the next skill from loading cleanly.`,
    '',
    top.content,
    '═══ END SKILL ═══',
  ].join('\n');
}
