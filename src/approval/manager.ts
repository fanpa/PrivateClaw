import type { ApprovalStatus } from './types.js';

export class ToolApprovalManager {
  private statuses = new Map<string, ApprovalStatus>();

  getStatus(toolName: string): ApprovalStatus {
    return this.statuses.get(toolName) ?? 'pending';
  }

  needsApproval(toolName: string): boolean {
    const status = this.getStatus(toolName);
    return status === 'pending';
  }

  allowAlways(toolName: string): void {
    this.statuses.set(toolName, 'always');
  }

  allowOnce(toolName: string): void {
    this.statuses.set(toolName, 'once');
  }

  consume(toolName: string): void {
    const status = this.getStatus(toolName);
    if (status === 'once') {
      this.statuses.set(toolName, 'pending');
    }
  }
}
