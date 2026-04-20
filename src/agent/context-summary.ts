import type { ModelMessage } from 'ai';

/**
 * Extract a concise context summary from conversation messages
 * for pre-reflection. No LLM call — pure rule-based extraction.
 *
 * Output format:
 *   User request: "..."
 *   Active skill: skill-name (or "none")
 *   Recent tools: tool1(summary) → tool2(summary)
 *
 * `activeSkillStack` — when provided, reflects authoritative agent state
 * (the skill-stack manager) and takes precedence over message scanning.
 */
export function buildContextSummary(messages: ModelMessage[], activeSkillStack?: readonly string[]): string {
  if (messages.length === 0 && (!activeSkillStack || activeSkillStack.length === 0)) {
    return 'No context available.';
  }

  // 1. Last user message
  let lastUserMessage = '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'user' && typeof msg.content === 'string') {
      lastUserMessage = msg.content.slice(0, 200);
      break;
    }
  }

  // 2. Active skill — prefer authoritative stack; fall back to message scan.
  let activeSkill = 'none';
  if (activeSkillStack && activeSkillStack.length > 0) {
    activeSkill = activeSkillStack.length === 1
      ? activeSkillStack[0]
      : `${activeSkillStack[activeSkillStack.length - 1]} (stack: ${activeSkillStack.join(' → ')})`;
  } else {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        for (const part of msg.content) {
          const p = part as Record<string, unknown>;
          if (p.type === 'tool-call' && p.toolName === 'use_skill') {
            const args = p.args as Record<string, unknown> | undefined;
            if (args?.name) {
              activeSkill = String(args.name);
            }
          }
        }
        if (activeSkill !== 'none') break;
      }
    }
  }

  // 3. Recent tool calls (last 5)
  const recentTools: string[] = [];
  for (const msg of messages) {
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        const p = part as Record<string, unknown>;
        if (p.type === 'tool-call') {
          const toolName = String(p.toolName ?? '');
          const args = p.args as Record<string, unknown> | undefined;
          let argSummary = '';
          if (toolName === 'shell_exec') argSummary = String(args?.command ?? '').slice(0, 50);
          else if (toolName === 'file_read' || toolName === 'file_write' || toolName === 'file_update') argSummary = String(args?.filePath ?? '').slice(0, 80);
          else if (toolName === 'api_call' || toolName === 'web_fetch') argSummary = String(args?.url ?? '').slice(0, 80);
          else if (toolName === 'use_skill') argSummary = String(args?.name ?? '');
          else argSummary = JSON.stringify(args ?? {}).slice(0, 50);
          recentTools.push(`${toolName}(${argSummary})`);
        }
      }
    }
  }
  const toolHistory = recentTools.length > 0
    ? recentTools.slice(-5).join(' → ')
    : 'none';

  return [
    `User request: "${lastUserMessage}"`,
    `Active skill: ${activeSkill}`,
    `Recent tools: ${toolHistory}`,
  ].join('\n');
}
