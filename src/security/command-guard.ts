/**
 * Extract the base command name from a command string.
 * "ls -la /tmp" → "ls"
 * "/usr/bin/curl http://..." → "curl"
 * "echo hello" → "echo"
 */
function extractCommandName(cmd: string): string {
  const trimmed = cmd.trim();
  if (!trimmed) return '';
  // Handle subshell: $(cmd), `cmd`
  // For simplicity, extract the first word and get basename
  const firstWord = trimmed.split(/\s+/)[0];
  // Get basename (handles /usr/bin/curl → curl)
  const parts = firstWord.split('/');
  return parts[parts.length - 1];
}

/**
 * Split a command string into individual commands by shell operators.
 * "echo hello && curl x || wget y ; ls" → ["echo hello", "curl x", "wget y", "ls"]
 * Also handles pipes: "cat file | grep pattern" → ["cat file", "grep pattern"]
 */
function splitCommands(command: string): string[] {
  // Split by &&, ||, ;, | but NOT inside quotes
  // Simple approach: split by these operators
  return command.split(/\s*(?:&&|\|\||[;|])\s*/).filter(Boolean);
}

/**
 * Check if all commands in a command string are allowed.
 * Returns { allowed: true } or { allowed: false, blockedCommand: string }
 */
export function isCommandAllowed(
  command: string,
  allowedCommands: string[],
): { allowed: true } | { allowed: false; blockedCommand: string } {
  // Empty whitelist = all commands allowed (no restriction)
  if (allowedCommands.length === 0) return { allowed: true };

  const commands = splitCommands(command);
  for (const cmd of commands) {
    const name = extractCommandName(cmd);
    if (!name) continue;
    if (!allowedCommands.includes(name)) {
      return { allowed: false, blockedCommand: name };
    }
  }

  return { allowed: true };
}
