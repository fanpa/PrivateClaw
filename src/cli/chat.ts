import * as readline from 'node:readline';
import type { ModelMessage } from 'ai';
import { runAgentTurn, DEFAULT_MAX_HISTORY } from '../agent/loop.js';
import { SessionRepository } from '../session/repository.js';
import { getProviderName } from '../provider/registry.js';
import { loadConfig } from '../config/loader.js';
import type { Config } from '../config/schema.js';
import { initFromConfig } from './app.js';
import { ToolApprovalManager } from '../approval/manager.js';
import type { ApprovalDecision } from '../approval/types.js';
import type { SkillConfig } from '../skills/types.js';
import { SkillStateManager } from '../skills/state.js';
import { loadSkillContent } from '../skills/loader.js';
import { normalizeApprovalChoice } from './input-normalize.js';
import {
  renderNewLine,
  renderError,
  renderErrorWithStack,
  renderWelcome,
  renderSessionInfo,
  renderSystemMessage,
  renderToolCall,
  renderToolResult,
  renderApprovalPrompt,
  renderApprovalResult,
  renderPreReflectExplanation,
  renderReflecting,
  renderReflectionDone,
  renderMarkdownResponse,
} from './renderer.js';

function buildApprovalKey(toolName: string, args: unknown): string {
  if (
    toolName === 'use_skill' &&
    args !== null &&
    typeof args === 'object' &&
    'name' in args &&
    typeof (args as Record<string, unknown>).name === 'string'
  ) {
    return `use_skill:${(args as { name: string }).name}`;
  }
  return toolName;
}

export function createApprovalHandler(
  rl: readline.Interface,
  approvalManager: ToolApprovalManager,
) {
  const handler = (toolName: string, args: unknown): Promise<ApprovalDecision> => {
    const key = buildApprovalKey(toolName, args);

    if (!approvalManager.needsApproval(key)) {
      approvalManager.consume(key);
      return Promise.resolve('allow_once');
    }

    renderApprovalPrompt(toolName, args);
    return new Promise((resolve) => {
      rl.question('', (answer) => {
        const choice = normalizeApprovalChoice(answer);
        let decision: ApprovalDecision;
        if (choice === 'a') {
          decision = 'allow_always';
          approvalManager.allowAlways(key);
        } else if (choice === 'y') {
          decision = 'allow_once';
          approvalManager.allowOnce(key);
          approvalManager.consume(key);
        } else {
          decision = 'deny';
        }
        renderApprovalResult(toolName, decision);
        resolve(decision);
      });
    });
  };

  return {
    handler,
    willPrompt: (toolName: string, args: unknown): boolean => {
      const key = buildApprovalKey(toolName, args);
      return approvalManager.needsApproval(key);
    },
  };
}

export interface ChatOptions {
  configPath?: string;
  temperature?: number;
  reflectionLoops?: number;
  maxHistoryMessages?: number;
  defaultHeaders?: Record<string, Record<string, string>>;
  allowedDomains?: string[];
  allowedCommands?: string[];
  skills?: SkillConfig[];
  skillsDir?: string;
  skillMarketUrl?: string;
  skillMaxDepth?: number;
  sessionDir?: string;
  specialists?: import('../tools/delegate.js').SpecialistEntry[];
}

function mergeConfigIntoOptions(options: ChatOptions, config: Config): ChatOptions {
  return {
    ...options,
    temperature: config.provider.temperature,
    reflectionLoops: config.provider.reflectionLoops,
    maxHistoryMessages: config.session.maxHistoryMessages,
    defaultHeaders: config.security.defaultHeaders,
    allowedDomains: config.security.allowedDomains,
    allowedCommands: config.security.allowedCommands,
    skills: config.skills,
    skillsDir: config.skillsDir,
    skillMarketUrl: config.skillMarketUrl,
    skillMaxDepth: config.skillMaxDepth,
    sessionDir: config.session.sessionDir,
  };
}

export async function startChat(
  sessionId?: string,
  options: ChatOptions = {},
): Promise<void> {
  const approvalManager = new ToolApprovalManager();

  let currentOptions = { ...options };

  const repo = new SessionRepository(currentOptions.sessionDir ?? './.privateclaw/sessions');

  let session = sessionId
    ? repo.getById(sessionId)
    : null;

  if (!session) {
    session = repo.create('New Chat');
  }

  const messages: ModelMessage[] = [...session.messages];

  const skillManager = new SkillStateManager(currentOptions.skillMaxDepth ?? 5);
  if (session.activeSkillNames && session.activeSkillNames.length > 0) {
    const dir = currentOptions.skillsDir ?? './skills';
    skillManager.restore(session.activeSkillNames, (name) => {
      try {
        return loadSkillContent(name, dir);
      } catch {
        return null;
      }
    });
  }

  const syncSkillState = (): void => {
    try {
      repo.updateActiveSkills(session!.id, skillManager.names());
    } catch {
      // best-effort persistence; session file may be transient in tests
    }
  };

  renderWelcome();
  renderSessionInfo(session.id, getProviderName());
  if (skillManager.depth() > 0) {
    renderSystemMessage(`Active skill stack: ${skillManager.names().join(' → ')}`);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = (): Promise<string> =>
    new Promise((resolve) => rl.question('> ', resolve));

  const reloadCurrentConfig = async (): Promise<{ config?: Config; error?: string }> => {
    if (!currentOptions.configPath) {
      return { error: 'Config path not available. Restart with -c option.' };
    }
    try {
      const config = loadConfig(currentOptions.configPath);
      initFromConfig(config);
      currentOptions = mergeConfigIntoOptions(currentOptions, config);
      return { config };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  };

  try {
    while (true) {
      const input = await prompt();
      const trimmed = input.trim();

      if (trimmed === '/quit' || trimmed === '/exit') break;
      if (trimmed === '') continue;

      if (trimmed === '/domains') {
        const domains = currentOptions.allowedDomains ?? [];
        if (domains.length === 0) {
          renderSystemMessage('No domain restrictions (all domains allowed).');
        } else {
          renderSystemMessage(`Allowed domains (${domains.length}):`);
          for (const d of domains) {
            renderSystemMessage(`  ${d}`);
          }
        }
        continue;
      }

      if (trimmed === '/reload') {
        const { config, error } = await reloadCurrentConfig();
        if (error) {
          renderError(`Failed to reload config: ${error}`);
          continue;
        }
        renderSystemMessage('Config reloaded successfully.');
        if (config) {
          renderSystemMessage(`Provider: ${config.provider.type} (${config.provider.model})`);
          renderSystemMessage(`Allowed domains: ${config.security.allowedDomains.join(', ') || '(none — all allowed)'}`);
        }
        continue;
      }

      if (trimmed === '/clear') {
        messages.length = 0;
        skillManager.clear();
        syncSkillState();
        renderSystemMessage('Conversation history and skill stack cleared.');
        continue;
      }

      if (trimmed === '/skill' || trimmed.startsWith('/skill ')) {
        const sub = trimmed.slice('/skill'.length).trim();
        if (sub === '' || sub === 'list') {
          if (skillManager.depth() === 0) {
            renderSystemMessage('No active skill.');
          } else {
            renderSystemMessage(`Active skill stack (${skillManager.depth()}/${skillManager.limit()}):`);
            skillManager.frames().forEach((f, i) => {
              const marker = i === skillManager.depth() - 1 ? '→' : ' ';
              renderSystemMessage(`  ${marker} ${f.name}`);
            });
          }
        } else if (sub === 'pop') {
          const popped = skillManager.pop();
          if (!popped) {
            renderSystemMessage('No active skill to pop.');
          } else {
            const current = skillManager.top();
            renderSystemMessage(`Popped "${popped.name}".` + (current ? ` Now active: "${current.name}".` : ' No skill active.'));
            syncSkillState();
          }
        } else if (sub === 'clear') {
          skillManager.clear();
          syncSkillState();
          renderSystemMessage('Skill stack cleared.');
        } else {
          renderSystemMessage('Usage: /skill [list|pop|clear]');
        }
        continue;
      }

      if (trimmed === '/help') {
        renderSystemMessage('Available commands:');
        renderSystemMessage('  /domains         — Show allowed domains');
        renderSystemMessage('  /reload          — Reload config file');
        renderSystemMessage('  /skill [list]    — Show active skill stack');
        renderSystemMessage('  /skill pop       — Pop top skill off the stack');
        renderSystemMessage('  /skill clear     — Clear the entire skill stack');
        renderSystemMessage('  /clear           — Clear conversation history + skill stack');
        renderSystemMessage('  /help            — Show this help');
        renderSystemMessage('  /quit            — Exit');
        continue;
      }

      messages.push({ role: 'user', content: trimmed });

      try {
        const approval = createApprovalHandler(rl, approvalManager);
        const stackBefore = skillManager.names().join('|');
        const result = await runAgentTurn({
          messages,
          temperature: currentOptions.temperature,
          reflectionLoops: currentOptions.reflectionLoops,
          maxHistoryMessages: currentOptions.maxHistoryMessages,
          defaultHeaders: currentOptions.defaultHeaders,
          allowedCommands: currentOptions.allowedCommands,
          skills: currentOptions.skills,
          skillsDir: currentOptions.skillsDir,
          skillManager,
          skillMarketUrl: currentOptions.skillMarketUrl,
          configPath: currentOptions.configPath,
          specialists: currentOptions.specialists,
          onReload: async () => (await reloadCurrentConfig()).error ?? null,
          onChunk: () => {},
          onPreReflectExplanation: renderPreReflectExplanation,
          onReflecting: renderReflecting,
          onReflectionDone: renderReflectionDone,
          onToolCall: (name, args) => {
            if (!approval.willPrompt(name, args)) {
              renderToolCall(name, args);
            }
          },
          onToolResult: (name, result) => {
            renderToolResult(name, result);
            const res = result as Record<string, unknown> | undefined;
            if (res?.error) {
              renderError(`Tool "${name}" failed: ${res.error}`);
            }
          },
          onToolApproval: approval.handler,
        });

        renderNewLine();
        if (result.text) {
          renderMarkdownResponse(result.text);
        }

        repo.appendMessages(session!.id, [
          { role: 'user' as const, content: trimmed },
          ...result.responseMessages,
        ]);

        messages.push(...result.responseMessages);

        const maxHistory = currentOptions.maxHistoryMessages ?? DEFAULT_MAX_HISTORY;
        if (maxHistory > 0 && messages.length > maxHistory) {
          messages.splice(0, messages.length - maxHistory);
        }

        if (skillManager.names().join('|') !== stackBefore) {
          syncSkillState();
        }
      } catch (err) {
        renderErrorWithStack(err);
      }
    }
  } finally {
    rl.close();
  }
}
