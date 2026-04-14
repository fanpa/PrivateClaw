import chalk from 'chalk';
import { renderMarkdown } from './markdown.js';

let verbose = false;
let pendingLineCount = 0;

function clearPendingLines(): void {
  if (pendingLineCount > 0) {
    for (let i = 0; i < pendingLineCount; i++) {
      process.stdout.write('\x1b[A\x1b[K'); // move up + clear line
    }
    pendingLineCount = 0;
  }
}

function clearCurrentLine(): void {
  process.stdout.write('\r\x1b[K');
}

export function setVerbose(v: boolean): void {
  verbose = v;
}

export function isVerbose(): boolean {
  return verbose;
}

export function renderChunk(chunk: string): void {
  process.stdout.write(chunk);
}

export function renderNewLine(): void {
  process.stdout.write('\n');
}

export function renderSystemMessage(message: string): void {
  console.log(chalk.dim(`[system] ${message}`));
}

export function renderError(message: string): void {
  console.error(chalk.red(`[error] ${message}`));
}

export function renderDebug(message: string): void {
  if (verbose) {
    console.log(chalk.gray(`[debug] ${message}`));
  }
}

export function renderErrorWithStack(err: unknown): void {
  if (err instanceof Error) {
    renderError(err.message);
    if (verbose && err.stack) {
      console.error(chalk.gray(err.stack));
    }
  } else {
    renderError(String(err));
  }
}

function describeToolCall(toolName: string, args: unknown): string {
  const a = args as Record<string, unknown> | null;
  switch (toolName) {
    case 'file_read':
      return `Reading file ${a?.filePath ?? ''}`;
    case 'file_write':
      return `Writing file ${a?.filePath ?? ''}`;
    case 'file_update':
      return `Updating file ${a?.filePath ?? ''}`;
    case 'shell_exec':
      return `Running command: ${a?.command ?? ''}`;
    case 'web_fetch':
      return `Fetching ${a?.url ?? ''}`;
    case 'api_call': {
      const method = (a?.method as string ?? 'GET').toUpperCase();
      return `API ${method} ${a?.url ?? ''}`;
    }
    case 'use_skill':
      return `Loading skill "${a?.name ?? ''}"`;
    case 'create_skill':
      return `Creating skill "${a?.name ?? ''}"`;
    case 'set_header':
      return `Setting header for ${a?.domain ?? ''}`;
    case 'reload_config':
      return 'Reloading config';
    case 'browser_auth':
      return `Opening browser for ${a?.url ?? ''}`;
    case 'delegate':
      return `Delegating to ${a?.specialist ?? ''} specialist`;
    case 'sync_skills':
      return 'Synchronizing skills';
    default:
      return `${toolName} ${JSON.stringify(args)}`;
  }
}

export function renderToolCall(toolName: string, args: unknown): void {
  clearPendingLines();
  process.stdout.write(chalk.yellow(`\n▶ ${describeToolCall(toolName, args)}`));
  pendingLineCount = 1;
}

function getConsoleWidth(): number {
  return process.stdout.columns || 80;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function wrapText(text: string, width: number): string {
  const lines: string[] = [];
  for (const line of text.split('\n')) {
    if (line.length <= width) {
      lines.push(line);
    } else {
      for (let i = 0; i < line.length; i += width) {
        lines.push(line.slice(i, i + width));
      }
    }
  }
  return lines.join('\n');
}

function renderHttpResult(toolName: string, result: Record<string, unknown>): void {
  const status = result.status as number | undefined;
  const body = result.body as string | undefined;
  const error = result.error as string | undefined;

  if (error) {
    console.log(chalk.cyan(`[tool:result] ${toolName}`), chalk.red(String(error)));
    return;
  }

  const bodySize = body ? formatBytes(Buffer.byteLength(body, 'utf-8')) : '0 B';
  console.log(chalk.cyan(`[tool:result] ${toolName}`), chalk.dim(`status=${status ?? '?'}, body=${bodySize}`));

  if (body && body.length > 0) {
    const width = getConsoleWidth();
    const maxLines = verbose ? Infinity : 30;
    const wrapped = wrapText(body, width - 2);
    const lines = wrapped.split('\n');
    const display = lines.slice(0, maxLines);
    console.log(chalk.dim(display.join('\n')));
    if (lines.length > maxLines) {
      console.log(chalk.dim(`... [${lines.length - maxLines} more lines]`));
    }
  }
}

export function renderToolResult(toolName: string, result: unknown): void {
  clearPendingLines();
  const res = result as Record<string, unknown> | undefined;

  // use_skill: show only skill name, suppress full skill.md content
  if (toolName === 'use_skill') {
    if (res?.error) {
      console.log(chalk.cyan(`[tool:result] ${toolName}`), chalk.red(String(res.error)));
    } else {
      console.log(chalk.cyan(`[tool:result] ${toolName}`), chalk.dim('skill loaded'));
    }
    return;
  }

  // file_update: show colored diff
  if (toolName === 'file_update') {
    const message = res?.message as string | undefined;
    const diff = res?.diff as string | undefined;
    console.log(chalk.cyan(`[tool:result] ${toolName}`), chalk.dim(message ?? ''));
    if (diff) {
      for (const line of diff.split('\n')) {
        if (line.startsWith('+')) {
          console.log(chalk.green(`  ${line}`));
        } else if (line.startsWith('-')) {
          console.log(chalk.red(`  ${line}`));
        }
      }
    }
    return;
  }

  // HTTP tool results (web_fetch, api_call) get summarized
  if (res && (toolName === 'web_fetch' || toolName === 'api_call') && ('status' in res || 'error' in res)) {
    renderHttpResult(toolName, res);
    return;
  }

  // shell_exec: show stdout/stderr as plain text, not JSON
  if (toolName === 'shell_exec') {
    const exitCode = res?.exitCode as number | undefined;
    const stdout = (res?.stdout as string | undefined) ?? '';
    const stderr = (res?.stderr as string | undefined) ?? '';
    const error = res?.error as string | undefined;

    const exitLabel = exitCode === 0 ? chalk.green(`exit=${exitCode}`) : chalk.red(`exit=${exitCode ?? '?'}`);
    console.log(chalk.cyan(`[tool:result] ${toolName}`), exitLabel);
    if (error) {
      console.log(chalk.red(error));
    }
    if (stdout) {
      process.stdout.write(chalk.dim(stdout.endsWith('\n') ? stdout : stdout + '\n'));
    }
    if (stderr) {
      process.stderr.write(chalk.yellow(stderr.endsWith('\n') ? stderr : stderr + '\n'));
    }
    return;
  }

  const json = JSON.stringify(result, null, 2);
  const width = getConsoleWidth();
  const maxLines = verbose ? Infinity : 20;
  const wrapped = wrapText(json, width - 2);
  const lines = wrapped.split('\n');
  const display = lines.slice(0, maxLines);
  console.log(chalk.cyan(`[tool:result] ${toolName}`));
  console.log(chalk.dim(display.join('\n')));
  if (lines.length > maxLines) {
    console.log(chalk.dim(`... [${lines.length - maxLines} more lines]`));
  }
}

export function renderReflecting(loop: number): void {
  if (verbose) {
    console.log(chalk.magenta(`\n[thinking] loop ${loop}...`));
  } else {
    process.stdout.write(chalk.magenta(`\nthinking...`));
  }
}

export function renderReflectionDone(changed: boolean): void {
  if (verbose) {
    console.log(chalk.magenta(`[thinking] ${changed ? 'response updated' : 'done'}`));
  } else {
    // Clear the "thinking..." line — result will be printed directly after
    clearCurrentLine();
  }
}

export function renderWelcome(): void {
  console.log(chalk.bold('\nPrivateClaw'));
  console.log(chalk.dim('Type your message and press Enter. Type /help for commands.\n'));
}

export function renderSessionInfo(sessionId: string, providerName: string): void {
  console.log(chalk.dim(`Session: ${sessionId} | Provider: ${providerName}${verbose ? ' | Verbose: ON' : ''}\n`));
}

export function renderApprovalPrompt(toolName: string, args: unknown): void {
  clearPendingLines();
  console.log(chalk.bold.yellow(`\n⚠ ${describeToolCall(toolName, args)}`));
  console.log(chalk.yellow('  [y] Allow once  [a] Allow always  [n] Deny'));
  pendingLineCount = 3; // blank line + description + options
}

export function renderMarkdownResponse(text: string): void {
  const formatted = renderMarkdown(text);
  process.stdout.write(formatted);
}

export function renderApprovalResult(toolName: string, decision: string): void {
  // Clear the approval prompt (including user's input line)
  clearPendingLines();
  // Also clear the line where user typed their answer
  clearCurrentLine();

  if (decision === 'deny') {
    console.log(chalk.red(`✗ "${toolName}" denied.`));
  } else {
    console.log(chalk.green(`✓ ${toolName}`));
  }
}
