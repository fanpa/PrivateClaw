import * as readline from 'node:readline';
import type { ModelMessage } from 'ai';
import { runAgentTurn } from '../agent/loop.js';
import { SessionRepository } from '../session/repository.js';
import { getProviderName } from '../provider/registry.js';
import { ToolApprovalManager } from '../approval/manager.js';
import type { ApprovalDecision } from '../approval/types.js';
import {
  renderChunk,
  renderNewLine,
  renderError,
  renderWelcome,
  renderSessionInfo,
  renderToolCall,
  renderToolResult,
  renderApprovalPrompt,
  renderApprovalResult,
} from './renderer.js';

function createApprovalHandler(
  rl: readline.Interface,
  approvalManager: ToolApprovalManager,
) {
  return (toolName: string, args: Record<string, unknown>): Promise<ApprovalDecision> => {
    if (!approvalManager.needsApproval(toolName)) {
      approvalManager.consume(toolName);
      return Promise.resolve('allow_once');
    }

    renderApprovalPrompt(toolName, args);
    return new Promise((resolve) => {
      rl.question('', (answer) => {
        const choice = answer.trim().toLowerCase();
        let decision: ApprovalDecision;
        if (choice === 'a') {
          decision = 'allow_always';
          approvalManager.allowAlways(toolName);
        } else if (choice === 'y') {
          decision = 'allow_once';
          approvalManager.allowOnce(toolName);
          approvalManager.consume(toolName);
        } else {
          decision = 'deny';
        }
        renderApprovalResult(toolName, decision);
        resolve(decision);
      });
    });
  };
}

export async function startChat(
  sessionId?: string,
  defaultHeaders?: Record<string, Record<string, string>>,
): Promise<void> {
  const repo = new SessionRepository();
  const approvalManager = new ToolApprovalManager();
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

      messages.push({ role: 'user', content: trimmed });

      try {
        const result = await runAgentTurn({
          messages,
          defaultHeaders,
          onChunk: renderChunk,
          onToolCall: (name, args) => renderToolCall(name, args),
          onToolResult: (name, result) => {
            renderToolResult(name, result);
            const res = result as Record<string, unknown> | undefined;
            if (res?.error) {
              renderError(`Tool "${name}" failed: ${res.error}`);
            }
          },
          onToolApproval: createApprovalHandler(rl, approvalManager),
        });

        renderNewLine();

        if (result.aborted) {
          renderError('Agent stopped by user.');
          continue;
        }

        messages.push(...result.responseMessages);
        repo.updateMessages(session!.id, messages);
      } catch (err) {
        renderError(err instanceof Error ? err.message : String(err));
      }
    }
  } finally {
    rl.close();
  }
}
