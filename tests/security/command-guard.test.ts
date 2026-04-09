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
});
