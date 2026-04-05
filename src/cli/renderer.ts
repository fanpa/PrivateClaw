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

export function renderToolResult(toolName: string, result: unknown): void {
  console.log(chalk.cyan(`[tool:result] ${toolName}`), chalk.dim(JSON.stringify(result)));
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
