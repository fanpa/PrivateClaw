import chalk from 'chalk';

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

export function renderToolCall(toolName: string, args: unknown): void {
  console.log(chalk.yellow(`\n[tool:call] ${toolName}`), chalk.dim(JSON.stringify(args)));
}

function getConsoleWidth(): number {
  return process.stdout.columns || 80;
}

function truncateText(text: string, maxChars: number): { truncated: string; isTruncated: boolean; totalLines: number } {
  const totalLines = text.split('\n').length;
  if (text.length <= maxChars) {
    return { truncated: text, isTruncated: false, totalLines };
  }
  return { truncated: text.slice(0, maxChars), isTruncated: true, totalLines };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  const width = getConsoleWidth();
  const maxChars = width * 2;

  let summary = chalk.cyan(`[tool:result] ${toolName}`) + chalk.dim(` status=${status ?? '?'}, body=${bodySize}`);

  if (body && body.length > 0) {
    const { truncated, isTruncated, totalLines } = truncateText(body, maxChars);
    const preview = truncated.replace(/\n/g, '\\n');
    summary += '\n' + chalk.dim(preview);
    if (isTruncated) {
      summary += chalk.dim(`... [${totalLines} lines, ${bodySize} total]`);
    }
  }

  console.log(summary);
}

export function renderToolResult(toolName: string, result: unknown): void {
  const res = result as Record<string, unknown> | undefined;

  // HTTP tool results (web_fetch, api_call) get summarized
  if (res && (toolName === 'web_fetch' || toolName === 'api_call') && ('status' in res || 'error' in res)) {
    renderHttpResult(toolName, res);
    return;
  }

  // Other tools: truncate if too long
  const json = JSON.stringify(result);
  const width = getConsoleWidth();
  const maxChars = width * 2;

  if (json.length <= maxChars) {
    console.log(chalk.cyan(`[tool:result] ${toolName}`), chalk.dim(json));
  } else {
    const truncated = json.slice(0, maxChars);
    console.log(chalk.cyan(`[tool:result] ${toolName}`), chalk.dim(truncated + `... [${formatBytes(json.length)} total]`));
  }
}

export function renderWelcome(): void {
  console.log(chalk.bold('\nPrivateClaw'));
  console.log(chalk.dim('Type your message and press Enter. Type /quit to exit.\n'));
}

export function renderSessionInfo(sessionId: string, providerName: string): void {
  console.log(chalk.dim(`Session: ${sessionId} | Provider: ${providerName}\n`));
}

export function renderApprovalPrompt(toolName: string, args: unknown): void {
  console.log(chalk.bold.yellow(`\n⚠ Tool "${toolName}" wants to execute:`));
  console.log(chalk.dim(JSON.stringify(args, null, 2)));
  console.log(chalk.yellow('  [y] Allow once  [a] Allow always  [n] Deny'));
}

export function renderApprovalResult(toolName: string, decision: string): void {
  if (decision === 'deny') {
    console.log(chalk.red(`✗ "${toolName}" denied. Stopping agent.`));
  } else if (decision === 'allow_always') {
    console.log(chalk.green(`✓ "${toolName}" allowed permanently.`));
  } else {
    console.log(chalk.green(`✓ "${toolName}" allowed once.`));
  }
}
