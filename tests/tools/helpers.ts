import { expect } from 'vitest';

export function assertToolStructure(tool: {
  name: string;
  description: string;
  tool: { inputSchema: unknown; execute: unknown };
}) {
  expect(tool.name).toBeDefined();
  expect(tool.description).toBeDefined();
  expect(tool.tool.inputSchema).toBeDefined();
  expect(typeof tool.tool.execute).toBe('function');
}
