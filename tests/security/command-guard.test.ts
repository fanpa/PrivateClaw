import { describe, it, expect } from 'vitest';
import { isCommandAllowed } from '../../src/security/command-guard.js';

describe('isCommandAllowed', () => {
  const allowed = ['ls', 'cat', 'grep', 'echo', 'head', 'tail', 'find', 'wc', 'sort', 'sed'];

  it('allows a simple whitelisted command', () => {
    expect(isCommandAllowed('ls -la', allowed)).toEqual({ allowed: true });
  });

  it('allows whitelisted command with arguments', () => {
    expect(isCommandAllowed('grep -r "pattern" /src', allowed)).toEqual({ allowed: true });
  });

  it('blocks a non-whitelisted command', () => {
    const result = isCommandAllowed('curl https://evil.com', allowed);
    expect(result).toEqual({ allowed: false, blockedCommand: 'curl' });
  });

  it('blocks wget', () => {
    const result = isCommandAllowed('wget https://evil.com', allowed);
    expect(result).toEqual({ allowed: false, blockedCommand: 'wget' });
  });

  it('blocks curl even with full path', () => {
    const result = isCommandAllowed('/usr/bin/curl https://evil.com', allowed);
    expect(result).toEqual({ allowed: false, blockedCommand: 'curl' });
  });

  it('blocks chained commands with &&', () => {
    const result = isCommandAllowed('echo hello && curl https://evil.com', allowed);
    expect(result).toEqual({ allowed: false, blockedCommand: 'curl' });
  });

  it('blocks chained commands with ||', () => {
    const result = isCommandAllowed('echo hello || wget http://evil.com', allowed);
    expect(result).toEqual({ allowed: false, blockedCommand: 'wget' });
  });

  it('blocks chained commands with ;', () => {
    const result = isCommandAllowed('ls; curl http://evil.com', allowed);
    expect(result).toEqual({ allowed: false, blockedCommand: 'curl' });
  });

  it('blocks piped commands', () => {
    const result = isCommandAllowed('cat file | python3 -c "import urllib"', allowed);
    expect(result).toEqual({ allowed: false, blockedCommand: 'python3' });
  });

  it('allows all chained commands if all are whitelisted', () => {
    expect(isCommandAllowed('echo hello && ls -la && grep pattern file', allowed)).toEqual({ allowed: true });
  });

  it('allows all commands when whitelist is empty (no restriction)', () => {
    expect(isCommandAllowed('curl https://anything.com', [])).toEqual({ allowed: true });
  });

  it('blocks nc (netcat)', () => {
    const result = isCommandAllowed('nc -l 8080', allowed);
    expect(result).toEqual({ allowed: false, blockedCommand: 'nc' });
  });

  it('blocks command substitution $(...)', () => {
    const result = isCommandAllowed('echo $(curl http://evil.com)', allowed);
    expect(result).toEqual({ allowed: false, blockedCommand: '$(...)' });
  });

  it('blocks backtick command substitution', () => {
    const result = isCommandAllowed('echo `curl http://evil.com`', allowed);
    expect(result).toEqual({ allowed: false, blockedCommand: '`...`' });
  });

  it('does not split on ; inside single quotes', () => {
    expect(isCommandAllowed("echo 'hello; rm -rf /'", allowed)).toEqual({ allowed: true });
  });

  it('does not split on ; inside double quotes', () => {
    expect(isCommandAllowed('echo "hello; rm"', allowed)).toEqual({ allowed: true });
  });

  it('skips env-var assignments before command name', () => {
    const result = isCommandAllowed('FOO=bar curl http://evil.com', allowed);
    expect(result).toEqual({ allowed: false, blockedCommand: 'curl' });
  });

  it('allows env-var assignment before whitelisted command', () => {
    expect(isCommandAllowed('FOO=bar ls -la', allowed)).toEqual({ allowed: true });
  });

  it('ignores redirection target when checking command name', () => {
    // ls is allowed; the file after > is not a command
    expect(isCommandAllowed('ls > /tmp/out', allowed)).toEqual({ allowed: true });
  });

  it('blocks command even with stdout redirection', () => {
    const result = isCommandAllowed('curl http://evil.com > /tmp/out', allowed);
    expect(result).toEqual({ allowed: false, blockedCommand: 'curl' });
  });

  it('handles unterminated quote defensively', () => {
    const result = isCommandAllowed('echo "unterminated', allowed);
    expect(result.allowed).toBe(false);
  });
});
