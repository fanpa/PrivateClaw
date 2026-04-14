import * as readline from 'node:readline';
import type { ModelMessage } from 'ai';
import { runAgentTurn } from '../agent/loop.js';
import { SessionRepository } from '../session/repository.js';
import { getProviderName } from '../provider/registry.js';
import { loadConfig } from '../config/loader.js';
import { initFromConfig } from './app.js';
import { ToolApprovalManager } from '../approval/manager.js';
import type { ApprovalDecision } from '../approval/types.js';
import type { SkillConfig } from '../skills/types.js';
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
        const choice = answer.trim().toLowerCase();
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
  sessionDir?: string;
  specialists?: import('../tools/delegate.js').SpecialistEntry[];
}

export async function startChat(
  sessionId?: string,
  options: ChatOptions = {},
): Promise<void> {
  const approvalManager = new ToolApprovalManager();

  // Mutable options that can be reloaded
  let currentOptions = { ...options };

  const repo = new SessionRepository(currentOptions.sessionDir ?? './.privateclaw/sessions');

  let session = sessionId
    ? repo.getById(sessionId)
    : null;

  if (!session) {
    session = repo.create('New Chat');
  }

  const messages: ModelMessage[] = [...session.messages];

  renderWelcome();
  renderSessionInfo(session.id, getProviderName());

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = (): Promise<string> =>
    new Promise((resolve) => rl.question('> ', resolve));

  try {
    while (true) {
      const input = await prompt();
      const trimmed = input.trim();

      if (trimmed === '/quit' || trimmed === '/exit') break;
      if (trimmed === '') continue;

      // Chat commands
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
        if (!currentOptions.configPath) {
          renderError('Config path not available. Restart with -c option.');
          continue;
        }
        try {
          const config = loadConfig(currentOptions.configPath);
          initFromConfig(config);
          currentOptions = {
            ...currentOptions,
            temperature: config.provider.temperature,
            reflectionLoops: config.provider.reflectionLoops,
            maxHistoryMessages: config.session.maxHistoryMessages,
            defaultHeaders: config.security.defaultHeaders,
            allowedDomains: config.security.allowedDomains,
            allowedCommands: config.security.allowedCommands,
            skills: config.skills,
            skillsDir: config.skillsDir,
            sessionDir: config.session.sessionDir,
          };
          renderSystemMessage('Config reloaded successfully.');
          renderSystemMessage(`Provider: ${config.provider.type} (${config.provider.model})`);
          renderSystemMessage(`Allowed domains: ${config.security.allowedDomains.join(', ') || '(none — all allowed)'}`);
        } catch (err) {
          renderError(`Failed to reload config: ${err instanceof Error ? err.message : String(err)}`);
        }
        continue;
      }

      if (trimmed === '/clear') {
        messages.length = 0;
        renderSystemMessage('Conversation history cleared.');
        continue;
      }

      if (trimmed === '/help') {
        renderSystemMessage('Available commands:');
        renderSystemMessage('  /domains  — Show allowed domains');
        renderSystemMessage('  /reload   — Reload config file');
        renderSystemMessage('  /clear    — Clear conversation history');
        renderSystemMessage('  /help     — Show this help');
        renderSystemMessage('  /quit     — Exit');
        continue;
      }

      messages.push({ role: 'user', content: trimmed });

      try {
        const approval = createApprovalHandler(rl, approvalManager);
        const result = await runAgentTurn({
          messages,
          temperature: currentOptions.temperature,
          reflectionLoops: currentOptions.reflectionLoops,
          maxHistoryMessages: currentOptions.maxHistoryMessages,
          defaultHeaders: currentOptions.defaultHeaders,
          allowedCommands: currentOptions.allowedCommands,
          skills: currentOptions.skills,
          skillsDir: currentOptions.skillsDir,
          configPath: currentOptions.configPath,
          specialists: currentOptions.specialists,
          onReload: async () => {
            if (!currentOptions.configPath) return 'Config path not available.';
            try {
              const config = loadConfig(currentOptions.configPath);
              initFromConfig(config);
              currentOptions = {
                ...currentOptions,
                temperature: config.provider.temperature,
                reflectionLoops: config.provider.reflectionLoops,
                maxHistoryMessages: config.session.maxHistoryMessages,
                defaultHeaders: config.security.defaultHeaders,
                allowedDomains: config.security.allowedDomains,
                allowedCommands: config.security.allowedCommands,
                skills: config.skills,
                skillsDir: config.skillsDir,
                sessionDir: config.session.sessionDir,
              };
              return null; // success
            } catch (err) {
              return err instanceof Error ? err.message : String(err);
            }
          },
          onChunk: () => {},
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

        // Save new messages incrementally (user message + response)
        repo.appendMessages(session!.id, [
          { role: 'user' as const, content: trimmed },
          ...result.responseMessages,
        ]);

        // Add response to in-memory array
        messages.push(...result.responseMessages);

        // Trim in-memory messages to sliding window to prevent unbounded growth
        const maxHistory = currentOptions.maxHistoryMessages ?? 20;
        if (maxHistory > 0 && messages.length > maxHistory) {
          messages.splice(0, messages.length - maxHistory);
        }
      } catch (err) {
        renderErrorWithStack(err);
      }
    }
  } finally {
    rl.close();
  }
}
