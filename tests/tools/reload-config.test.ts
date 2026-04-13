import { describe, it, expect, vi } from 'vitest';
import { createReloadConfigTool } from '../../src/tools/reload-config.js';

describe('createReloadConfigTool', () => {
  it('has correct name', () => {
    const tool = createReloadConfigTool(async () => null);
    expect(tool.name).toBe('reload_config');
  });

  it('calls onReload callback and returns success', async () => {
    const onReload = vi.fn().mockResolvedValue(null);
    const tool = createReloadConfigTool(onReload);
    const result = await tool.execute();

    expect(onReload).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it('returns error message from onReload', async () => {
    const onReload = vi.fn().mockResolvedValue('Config parse error');
    const tool = createReloadConfigTool(onReload);
    const result = await tool.execute();

    expect(result.error).toContain('Config parse error');
    expect(result.success).toBeUndefined();
  });

  it('handles thrown errors', async () => {
    const onReload = vi.fn().mockRejectedValue(new Error('File not found'));
    const tool = createReloadConfigTool(onReload);
    const result = await tool.execute();

    expect(result.error).toContain('File not found');
  });

  it('tool.execute works via AI SDK path', async () => {
    const onReload = vi.fn().mockResolvedValue(null);
    const tool = createReloadConfigTool(onReload);
    const result = await tool.tool.execute({}, { toolCallId: 'test', messages: [] } as never);
    expect(result.success).toBe(true);
  });
});
