import { describe, it, expect, beforeEach } from 'vitest';
import { ToolApprovalManager } from '../../src/approval/manager.js';

describe('ToolApprovalManager', () => {
  let manager: ToolApprovalManager;

  beforeEach(() => {
    manager = new ToolApprovalManager();
  });

  it('returns "pending" for unknown tools', () => {
    expect(manager.getStatus('file_read')).toBe('pending');
  });

  it('allows a tool permanently', () => {
    manager.allowAlways('file_read');
    expect(manager.getStatus('file_read')).toBe('always');
  });

  it('allows a tool once', () => {
    manager.allowOnce('bash_exec');
    expect(manager.getStatus('bash_exec')).toBe('once');
  });

  it('resets "once" status after consume', () => {
    manager.allowOnce('bash_exec');
    expect(manager.getStatus('bash_exec')).toBe('once');
    manager.consume('bash_exec');
    expect(manager.getStatus('bash_exec')).toBe('pending');
  });

  it('does not reset "always" status after consume', () => {
    manager.allowAlways('file_read');
    manager.consume('file_read');
    expect(manager.getStatus('file_read')).toBe('always');
  });

  it('needsApproval returns true for pending tools', () => {
    expect(manager.needsApproval('web_fetch')).toBe(true);
  });

  it('needsApproval returns false for always-allowed tools', () => {
    manager.allowAlways('web_fetch');
    expect(manager.needsApproval('web_fetch')).toBe(false);
  });

  it('needsApproval returns false for once-allowed tools (not yet consumed)', () => {
    manager.allowOnce('web_fetch');
    expect(manager.needsApproval('web_fetch')).toBe(false);
  });
});
