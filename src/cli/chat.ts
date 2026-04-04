import * as readline from 'node:readline';
import type { CoreMessage } from 'ai';
import { runAgentTurn } from '../agent/loop.js';
import { SessionRepository } from '../session/repository.js';
import { getProviderName } from '../provider/registry.js';
import {
  renderChunk,
  renderNewLine,
  renderError,
  renderWelcome,
  renderSessionInfo,
} from './renderer.js';

export async function startChat(
  sessionId?: string,
): Promise<void> {
  const repo = new SessionRepository();
  let session = sessionId
    ? repo.getById(sessionId)
    : null;

  if (!session) {
    session = repo.create('New Chat');
  }

  const messages: CoreMessage[] = [...session.messages];

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
          onChunk: renderChunk,
        });

        renderNewLine();
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
