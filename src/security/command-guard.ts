type ParseError = 'SUBSHELL' | 'BACKTICK' | 'UNTERMINATED_QUOTE';

interface ParseResult {
  segments: string[];
  error?: ParseError;
}

function parseCommandLine(command: string): ParseResult {
  const segments: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let i = 0;

  while (i < command.length) {
    const ch = command[i];
    const next = command[i + 1];

    if (!inSingle && ch === '\\' && i + 1 < command.length) {
      current += ch + command[i + 1];
      i += 2;
      continue;
    }

    if (!inDouble && ch === "'") {
      inSingle = !inSingle;
      current += ch;
      i++;
      continue;
    }

    if (!inSingle && ch === '"') {
      inDouble = !inDouble;
      current += ch;
      i++;
      continue;
    }

    if (!inSingle) {
      if (ch === '$' && next === '(') return { segments: [], error: 'SUBSHELL' };
      if (ch === '`') return { segments: [], error: 'BACKTICK' };
    }

    if (!inSingle && !inDouble) {
      if (ch === '&' && next === '&') {
        segments.push(current);
        current = '';
        i += 2;
        continue;
      }
      if (ch === '|' && next === '|') {
        segments.push(current);
        current = '';
        i += 2;
        continue;
      }
      if (ch === ';' || ch === '|') {
        segments.push(current);
        current = '';
        i++;
        continue;
      }
    }

    current += ch;
    i++;
  }

  if (inSingle || inDouble) return { segments: [], error: 'UNTERMINATED_QUOTE' };
  segments.push(current);
  return { segments: segments.map((s) => s.trim()).filter(Boolean) };
}

function stripRedirection(segment: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if (!inSingle && ch === '\\') {
      i++;
      continue;
    }
    if (!inDouble && ch === "'") inSingle = !inSingle;
    else if (!inSingle && ch === '"') inDouble = !inDouble;
    else if (!inSingle && !inDouble && (ch === '>' || ch === '<')) {
      let start = i;
      const prev = segment[i - 1];
      if (prev && /[0-9]/.test(prev)) start = i - 1;
      return segment.slice(0, start).trim();
    }
  }
  return segment;
}

function extractCommandName(segment: string): string {
  const tokens = segment.trim().split(/\s+/);
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++;
  if (i >= tokens.length) return '';
  const first = tokens[i];
  const parts = first.split('/');
  return parts[parts.length - 1];
}

export function isCommandAllowed(
  command: string,
  allowedCommands: string[],
): { allowed: true } | { allowed: false; blockedCommand: string } {
  if (allowedCommands.length === 0) return { allowed: true };

  const parsed = parseCommandLine(command);
  if (parsed.error === 'SUBSHELL') {
    return { allowed: false, blockedCommand: '$(...)' };
  }
  if (parsed.error === 'BACKTICK') {
    return { allowed: false, blockedCommand: '`...`' };
  }
  if (parsed.error === 'UNTERMINATED_QUOTE') {
    return { allowed: false, blockedCommand: '<unterminated quote>' };
  }

  for (const seg of parsed.segments) {
    const name = extractCommandName(stripRedirection(seg));
    if (!name) continue;
    if (!allowedCommands.includes(name)) {
      return { allowed: false, blockedCommand: name };
    }
  }

  return { allowed: true };
}
