import { Command } from 'commander';
import { loadConfig } from '../config/loader.js';
import type { Config } from '../config/schema.js';
import { initProvider } from '../provider/registry.js';
import { createDatabase, closeDatabase } from '../session/db.js';
import { createRestrictedFetch } from '../security/restricted-fetch.js';
import { isDomainAllowed } from '../security/domain-guard.js';
import { SessionRepository } from '../session/repository.js';
import { startChat } from './chat.js';
import { renderError, renderSystemMessage } from './renderer.js';

export function initFromConfig(config: Config): void {
  if (config.security.allowedDomains.length > 0) {
    const providerHostname = new URL(config.provider.baseURL).hostname;
    if (!isDomainAllowed(providerHostname, config.security.allowedDomains)) {
      throw new Error(
        `LLM provider domain "${providerHostname}" is not in allowedDomains.\n` +
        `  Add "${providerHostname}" to security.allowedDomains in your config file.`
      );
    }
  }

  const restrictedFetch = createRestrictedFetch(config.security.allowedDomains);
  initProvider(config.provider, restrictedFetch);
}

export function createApp(): Command {
  const program = new Command();

  program
    .name('privateclaw')
    .description('A self-hosted AI agent CLI')
    .version('0.1.0');

  program
    .command('chat')
    .description('Start an interactive chat session')
    .option('-c, --config <path>', 'Path to config file', 'privateclaw.config.json')
    .option('-s, --session <id>', 'Resume a previous session by ID')
    .action(async (opts: { config: string; session?: string }) => {
      try {
        const config = loadConfig(opts.config);
        initFromConfig(config);
        createDatabase(config.session.dbPath);
        await startChat(opts.session, {
          configPath: opts.config,
          defaultHeaders: config.security.defaultHeaders,
          allowedDomains: config.security.allowedDomains,
          skills: config.skills,
          skillsDir: config.skillsDir,
        });
      } catch (err) {
        renderError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      } finally {
        closeDatabase();
      }
    });

  program
    .command('sessions')
    .description('List all saved sessions')
    .option('-c, --config <path>', 'Path to config file', 'privateclaw.config.json')
    .action((opts: { config: string }) => {
      try {
        const config = loadConfig(opts.config);
        createDatabase(config.session.dbPath);
        const repo = new SessionRepository();
        const sessions = repo.list();

        if (sessions.length === 0) {
          renderSystemMessage('No sessions found.');
          return;
        }

        for (const s of sessions) {
          console.log(`  ${s.id}  ${s.title}  (${s.updatedAt})`);
        }
      } catch (err) {
        renderError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      } finally {
        closeDatabase();
      }
    });

  program
    .command('domains')
    .description('List allowed domains from config')
    .option('-c, --config <path>', 'Path to config file', 'privateclaw.config.json')
    .action((opts: { config: string }) => {
      try {
        const config = loadConfig(opts.config);
        const domains = config.security.allowedDomains;

        if (domains.length === 0) {
          renderSystemMessage('No domain restrictions (all domains allowed).');
          return;
        }

        console.log(`Allowed domains (${domains.length}):`);
        for (const d of domains) {
          console.log(`  ${d}`);
        }
      } catch (err) {
        renderError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  return program;
}
