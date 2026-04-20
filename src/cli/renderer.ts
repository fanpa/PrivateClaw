import chalk from 'chalk';
import { existsSync, readFileSync } from 'node:fs';
import { renderMarkdown } from './markdown.js';

let verbose = false;
let thinkingTimer: ReturnType<typeof setInterval> | null = null;
let toolCallPending = false; // tracks if a transient tool-call line is showing
let approvalLineCount = 0; // tracks lines printed by approval prompt for cleanup

/** Move cursor up N lines and clear each */
function eraseLines(count: number): void {
  for (let i = 0; i < count; i++) {
    process.stdout.write('\x1b[A\x1b[K');
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
    case 'exit_skill':
      return 'Exiting current skill';
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

/**
 * Tool call — shown as a transient status line.
 * Will be replaced by the tool result or approval prompt.
 */
export function renderPreReflectExplanation(explanation: string): void {
  console.log(chalk.dim(`\n${explanation}`));
}

export function renderToolCall(toolName: string, args: unknown): void {
  if (verbose) {
    console.log(chalk.yellow(`\n▶ ${describeToolCall(toolName, args)}`));
    return;
  }
  // Non-verbose: show transient line (no newline at end)
  process.stdout.write(chalk.yellow(`\n▶ ${describeToolCall(toolName, args)}`));
  toolCallPending = true;
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

  if (!verbose) {
    console.log(chalk.cyan(`✓ ${toolName}`), chalk.dim(`status=${status ?? '?'}, ${bodySize}`));
    return;
  }

  console.log(chalk.cyan(`[tool:result] ${toolName}`), chalk.dim(`status=${status ?? '?'}, body=${bodySize}`));
  if (body && body.length > 0) {
    const width = getConsoleWidth();
    const wrapped = wrapText(body, width - 2);
    console.log(chalk.dim(wrapped));
  }
}

/**
 * Tool result — replaces the transient tool-call line (in non-verbose mode).
 */
export function renderToolResult(toolName: string, result: unknown): void {
  // Clear the transient tool-call line if present
  if (!verbose && toolCallPending) {
    clearCurrentLine();
    eraseLines(1); // erase the "\n▶ ..." line
    toolCallPending = false;
  }

  const res = result as Record<string, unknown> | undefined;

  // use_skill: compact summary, including resulting stack if provided
  if (toolName === 'use_skill') {
    if (res?.error) {
      console.log(chalk.cyan(`✓ ${toolName}`), chalk.red(String(res.error)));
    } else {
      const stack = Array.isArray(res?.stack) ? (res.stack as string[]) : null;
      const suffix = stack && stack.length > 0 ? `stack: ${stack.join(' → ')}` : 'skill loaded';
      const note = res?.duplicated ? ' (already active)' : '';
      console.log(chalk.cyan(`✓ ${toolName}`), chalk.dim(suffix + note));
    }
    return;
  }

  // exit_skill: compact summary of the stack after popping
  if (toolName === 'exit_skill') {
    if (res?.error) {
      console.log(chalk.cyan(`✓ ${toolName}`), chalk.red(String(res.error)));
    } else {
      const exited = res?.exited as string | undefined;
      const current = res?.current as string | null | undefined;
      const summary = current ? `exited "${exited}" → now "${current}"` : `exited "${exited}" (no skill active)`;
      console.log(chalk.cyan(`✓ ${toolName}`), chalk.dim(summary));
    }
    return;
  }

  // file_update: show colored diff (verbose only)
  if (toolName === 'file_update') {
    const message = res?.message as string | undefined;
    const diff = res?.diff as string | undefined;
    if (!verbose) {
      console.log(chalk.cyan(`✓ ${toolName}`), chalk.dim(message ?? ''));
      return;
    }
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

  // shell_exec
  if (toolName === 'shell_exec') {
    const exitCode = res?.exitCode as number | undefined;
    const stdout = (res?.stdout as string | undefined) ?? '';
    const stderr = (res?.stderr as string | undefined) ?? '';
    const error = res?.error as string | undefined;

    if (!verbose) {
      const exitLabel = exitCode === 0 ? chalk.green('ok') : chalk.red(`exit=${exitCode ?? '?'}`);
      const preview = (error || stderr || stdout).split('\n')[0].trim();
      const width = getConsoleWidth();
      const prefix = `✓ ${toolName} ${exitLabel} `;
      const maxPreview = width - prefix.length - 4;
      const truncated = preview.length > maxPreview ? preview.slice(0, maxPreview) + '...' : preview;
      console.log(chalk.cyan(`✓ ${toolName}`), exitLabel, chalk.dim(truncated));
      return;
    }

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

  // Generic fallback
  if (!verbose) {
    const json = JSON.stringify(result);
    const width = getConsoleWidth();
    const prefix = `✓ ${toolName} `;
    const maxLen = width - prefix.length - 4;
    const truncated = json.length > maxLen ? json.slice(0, maxLen) + '...' : json;
    console.log(chalk.cyan(`✓ ${toolName}`), chalk.dim(truncated));
    return;
  }

  const json = JSON.stringify(result, null, 2);
  const width = getConsoleWidth();
  const wrapped = wrapText(json, width - 2);
  console.log(chalk.cyan(`[tool:result] ${toolName}`));
  console.log(chalk.dim(wrapped));
}

// --- Thinking animation ---

function startThinkingAnimation(): void {
  stopThinkingAnimation();
  const frames = ['.', '..', '...', '..'];
  let i = 0;
  process.stdout.write(chalk.magenta(`thinking ${frames[0]}`));
  thinkingTimer = setInterval(() => {
    i = (i + 1) % frames.length;
    clearCurrentLine();
    process.stdout.write(chalk.magenta(`thinking ${frames[i]}`));
  }, 500);
}

function stopThinkingAnimation(): void {
  if (thinkingTimer) {
    clearInterval(thinkingTimer);
    thinkingTimer = null;
  }
}

export function renderReflecting(loop: number): void {
  if (verbose) {
    console.log(chalk.magenta(`\n[thinking] loop ${loop}...`));
  } else {
    if (loop === 1) {
      process.stdout.write('\n');
    }
    clearCurrentLine();
    startThinkingAnimation();
  }
}

export function renderReflectionDone(changed: boolean): void {
  stopThinkingAnimation();
  if (verbose) {
    console.log(chalk.magenta(`[thinking] ${changed ? 'response updated' : 'done'}`));
  } else {
    clearCurrentLine();
  }
}

// --- Approval ---

/**
 * Show approval prompt — this MUST remain visible until the user answers.
 * No pendingLineCount tracking here; clearing is handled by renderApprovalResult.
 */
/** Returns number of lines printed */
function renderFileDiffPreview(filePath: string, newContent: string): number {
  const width = getConsoleWidth();
  const maxPreviewLines = 15;
  let printed = 0;

  if (!existsSync(filePath)) {
    // New file — show content preview
    const lines = newContent.split('\n');
    const display = lines.slice(0, maxPreviewLines);
    for (const line of display) {
      const truncated = line.length > width - 6 ? line.slice(0, width - 9) + '...' : line;
      console.log(chalk.green(`  + ${truncated}`));
      printed++;
    }
    if (lines.length > maxPreviewLines) {
      console.log(chalk.dim(`  ... ${lines.length - maxPreviewLines} more lines`));
      printed++;
    }
    return printed;
  }

  // Existing file — show diff
  let oldContent: string;
  try {
    oldContent = readFileSync(filePath, 'utf-8');
  } catch {
    return 0;
  }

  if (oldContent === newContent) {
    console.log(chalk.dim('  (no changes)'));
    return 1;
  }

  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const diffLines: string[] = [];

  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : undefined;
    const newLine = i < newLines.length ? newLines[i] : undefined;
    if (oldLine === newLine) continue;
    if (oldLine !== undefined) diffLines.push(`- ${oldLine}`);
    if (newLine !== undefined) diffLines.push(`+ ${newLine}`);
  }

  const display = diffLines.slice(0, maxPreviewLines);
  for (const line of display) {
    const truncated = line.length > width - 4 ? line.slice(0, width - 7) + '...' : line;
    if (line.startsWith('+')) {
      console.log(chalk.green(`  ${truncated}`));
    } else {
      console.log(chalk.red(`  ${truncated}`));
    }
    printed++;
  }
  if (diffLines.length > maxPreviewLines) {
    console.log(chalk.dim(`  ... ${diffLines.length - maxPreviewLines} more changes`));
    printed++;
  }
  return printed;
}

export function renderApprovalPrompt(toolName: string, args: unknown): void {
  // If a transient tool-call line is showing, clear it first
  if (!verbose && toolCallPending) {
    clearCurrentLine();
    eraseLines(1);
    toolCallPending = false;
  }
  console.log(chalk.bold.yellow(`\n⚠ ${describeToolCall(toolName, args)}`));
  approvalLineCount = 2; // blank line + description

  // Show diff preview for file operations
  const a = args as Record<string, unknown> | null;
  if ((toolName === 'file_update' || toolName === 'file_write') && a?.filePath && a?.content) {
    approvalLineCount += renderFileDiffPreview(a.filePath as string, a.content as string);
  }

  console.log(chalk.yellow('  [y] Allow once  [a] Allow always  [n] Deny'));
  approvalLineCount++; // options line
}

/**
 * After user answers, clear the prompt and show a one-line summary.
 */
export function renderApprovalResult(toolName: string, decision: string): void {
  if (!verbose && approvalLineCount > 0) {
    clearCurrentLine(); // clear user's input line
    eraseLines(approvalLineCount); // erase the prompt + diff preview
    approvalLineCount = 0;
  }

  if (decision === 'deny') {
    console.log(chalk.red(`✗ "${toolName}" denied.`));
  } else {
    console.log(chalk.green(`✓ ${toolName}`));
  }
}

// --- Other ---

export function renderWelcome(): void {
  console.log(chalk.bold('\nPrivateClaw'));
  console.log(chalk.dim('Type your message and press Enter. Type /help for commands.\n'));
}

export function renderSessionInfo(sessionId: string, providerName: string): void {
  console.log(chalk.dim(`Session: ${sessionId} | Provider: ${providerName}${verbose ? ' | Verbose: ON' : ''}\n`));
}

/** Strip LLM-generated fake tool call syntax (e.g. <tool_code>...</tool_code>) from text */
function stripFakeToolCalls(text: string): string {
  return text
    .replace(/<tool_code>[\s\S]*?<\/tool_code>/g, '')
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
    .trim();
}

export function renderMarkdownResponse(text: string): void {
  const cleaned = stripFakeToolCalls(text);
  if (!cleaned) return;
  const formatted = renderMarkdown(cleaned);
  process.stdout.write(formatted);
}
