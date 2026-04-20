import { Command } from 'commander';
import { loadConfig } from '../config/loader.js';
import type { Config } from '../config/schema.js';
import { initProvider } from '../provider/registry.js';
import { createProvider } from '../provider/create.js';
import { createRestrictedFetch } from '../security/restricted-fetch.js';
import { isDomainAllowed } from '../security/domain-guard.js';
import type { SpecialistEntry } from '../tools/delegate.js';
import { SessionRepository } from '../session/repository.js';
import { startChat } from './chat.js';
import { renderError, renderSystemMessage, setVerbose } from './renderer.js';
import { executeRun } from './run.js';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeAuth } from './auth.js';
import { executeInit, executeInteractiveInit, autoRegisterSkills } from './init.js';

function buildSpecialists(config: Config, restrictedFetch: typeof globalThis.fetch): SpecialistEntry[] {
  return config.specialists.map((s) => {
    const { model } = createProvider({
      config: {
        type: s.type,
        baseURL: s.baseURL,
        apiKey: s.apiKey,
        model: s.model,
        temperature: 0.7,
        reflectionLoops: 0,
      },
      fetch: restrictedFetch,
    });
    return { role: s.role, model, description: s.description };
  });
}

export function initFromConfig(config: Config): typeof globalThis.fetch {
  if (config.security.allowedDomains.length > 0 && config.provider.baseURL) {
    const providerHostname = new URL(config.provider.baseURL).hostname;
    if (!isDomainAllowed(providerHostname, config.security.allowedDomains)) {
      throw new Error(
        `LLM provider domain "${providerHostname}" is not in allowedDomains.\n` +
        `  Add "${providerHostname}" to security.allowedDomains in your config file.`
      );
    }
  }

  const restrictedFetch = createRestrictedFetch(config.security.allowedDomains, {
    tlsSkipVerify: config.security.tlsSkipVerify,
    tlsCaPath: config.security.tlsCaPath,
  });
  initProvider(config.provider, restrictedFetch);
  return restrictedFetch;
}

function getVersion(): string {
  try {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    // Walk up to find package.json (works from src/cli/ and dist/src/cli/)
    for (let dir = thisDir; dir !== dirname(dir); dir = dirname(dir)) {
      const pkgPath = join(dir, 'package.json');
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.name === 'privateclaw') return pkg.version;
      }
    }
  } catch {
    // fall through
  }
  return '0.0.0';
}

export function createApp(): Command {
  const program = new Command();

  program
    .name('privateclaw')
    .description('A self-hosted AI agent CLI')
    .version(getVersion());

  program
    .command('init')
    .description('Interactive setup — configure LLM provider, discover models, create skills')
    .option('-c, --config <path>', 'Path to config file', 'privateclaw.config.json')
    .option('--skills-dir <path>', 'Path to skills directory', './skills')
    .action(async (opts: { config: string; skillsDir: string }) => {
      try {
        if (existsSync(opts.config)) {
          renderSystemMessage('Config file already exists. Delete it first to re-initialize.');
          return;
        }
        await executeInteractiveInit(opts.config, opts.skillsDir);
      } catch (err) {
        renderError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  program
    .command('chat')
    .description('Start an interactive chat session')
    .option('-c, --config <path>', 'Path to config file', 'privateclaw.config.json')
    .option('-s, --session <id>', 'Resume a previous session by ID')
    .option('-v, --verbose', 'Enable verbose output (show full tool results and stack traces)')
    .action(async (opts: { config: string; session?: string; verbose?: boolean }) => {
      try {
        if (opts.verbose) setVerbose(true);

        // Auto-init if config doesn't exist
        if (!existsSync(opts.config)) {
          renderSystemMessage('Config file not found. Starting interactive setup...\n');
          await executeInteractiveInit(opts.config, './skills');
          if (!existsSync(opts.config)) return;
        }

        const config = loadConfig(opts.config);

        // Auto-discover unregistered skills
        const newSkills = autoRegisterSkills(opts.config, config.skillsDir);
        if (newSkills.length > 0) {
          renderSystemMessage(`Auto-registered skills: ${newSkills.join(', ')}`);
          // Reload config to pick up newly registered skills
          Object.assign(config, loadConfig(opts.config));
        }
        const restrictedFetch = initFromConfig(config);
        const specialists = buildSpecialists(config, restrictedFetch);
        await startChat(opts.session, {
          configPath: opts.config,
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
          specialists,
        });
      } catch (err) {
        renderError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  program
    .command('sessions')
    .description('List all saved sessions')
    .option('-c, --config <path>', 'Path to config file', 'privateclaw.config.json')
    .action((opts: { config: string }) => {
      try {
        const config = loadConfig(opts.config);
        const repo = new SessionRepository(config.session.sessionDir);
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

  program
    .command('run')
    .description('Execute a prompt or skill non-interactively (headless mode)')
    .option('-c, --config <path>', 'Path to config file', 'privateclaw.config.json')
    .option('-p, --prompt <text>', 'Prompt to execute')
    .option('-s, --skill <name>', 'Skill to execute')
    .option('-v, --verbose', 'Enable verbose output')
    .action(async (opts: { config: string; prompt?: string; skill?: string; verbose?: boolean }) => {
      if (!opts.prompt && !opts.skill) {
        renderError('Either --prompt or --skill is required.');
        process.exit(1);
      }

      try {
        if (opts.verbose) setVerbose(true);
        const config = loadConfig(opts.config);

        // Auto-discover unregistered skills
        autoRegisterSkills(opts.config, config.skillsDir);
        Object.assign(config, loadConfig(opts.config));

        const runRestrictedFetch = initFromConfig(config);
        const runSpecialists = buildSpecialists(config, runRestrictedFetch);

        const prompt = opts.prompt ?? `Execute the "${opts.skill}" skill workflow.`;

        const output = await executeRun({
          prompt,
          skillName: opts.skill,
          temperature: config.provider.temperature,
          reflectionLoops: config.provider.reflectionLoops,
          defaultHeaders: config.security.defaultHeaders,
          allowedCommands: config.security.allowedCommands,
          skills: config.skills,
          skillsDir: config.skillsDir,
          skillMaxDepth: config.skillMaxDepth,
          specialists: runSpecialists,
        });

        if (output) {
          process.stdout.write(output + '\n');
        }
      } catch (err) {
        renderError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  program
    .command('auth')
    .description('Open browser to capture login cookies for a domain')
    .requiredOption('-u, --url <url>', 'Login page URL')
    .option('-c, --config <path>', 'Path to config file', 'privateclaw.config.json')
    .option('-w, --wait-for <url>', 'URL pattern to wait for after login (e.g. "*/dashboard*")')
    .option('-t, --timeout <ms>', 'Timeout in milliseconds', '300000')
    .option('-H, --header <header...>', 'Extra headers to inject (format: "Key:Value")')
    .action(async (opts: { url: string; config: string; waitFor?: string; timeout: string; header?: string[] }) => {
      try {
        // Parse --header flags: ["User-Agent:Bot/1.0", "X-Custom:value"] → { "User-Agent": "Bot/1.0", ... }
        const extraHeaders: Record<string, string> = {};
        if (opts.header) {
          for (const h of opts.header) {
            const idx = h.indexOf(':');
            if (idx > 0) {
              extraHeaders[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
            }
          }
        }

        const result = await executeAuth({
          url: opts.url,
          waitForUrl: opts.waitFor,
          timeout: parseInt(opts.timeout, 10),
          extraHeaders: Object.keys(extraHeaders).length > 0 ? extraHeaders : undefined,
        });

        // CLI auth command saves cookies as Cookie header to config
        const cookieHeader = result.cookies.map((c) => `${c.name}=${c.value}`).join('; ');

        const { readFileSync, writeFileSync } = await import('node:fs');
        const raw = readFileSync(opts.config, 'utf-8');
        const config = JSON.parse(raw);

        if (!config.security) config.security = {};
        if (!config.security.defaultHeaders) config.security.defaultHeaders = {};
        if (!config.security.defaultHeaders[result.domain]) config.security.defaultHeaders[result.domain] = {};

        config.security.defaultHeaders[result.domain]['Cookie'] = cookieHeader;

        writeFileSync(opts.config, JSON.stringify(config, null, 2) + '\n', 'utf-8');

        console.log(`\n✓ Captured ${result.cookies.length} cookies for ${result.domain}`);
        console.log(`  Saved to ${opts.config} → security.defaultHeaders["${result.domain}"].Cookie`);
        console.log(`  Use "privateclaw chat" to start using the authenticated session.`);
      } catch (err) {
        renderError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  return program;
}
