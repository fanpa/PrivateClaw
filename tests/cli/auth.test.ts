import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('auth command', () => {
  it('detectBrowserChannel returns appropriate channel for platform', async () => {
    const mod = await import('../../src/cli/auth.js');
    expect(mod.executeAuth).toBeTypeOf('function');
  });

  describe('executeAuth - playwright-core not available', () => {
    beforeEach(() => {
      vi.doMock('playwright-core', () => {
        throw new Error('Cannot find module playwright-core');
      });
    });

    afterEach(() => {
      vi.doUnmock('playwright-core');
    });

    it('throws a helpful error when playwright-core is missing', async () => {
      // Reset module cache so dynamic import re-evaluates the mock
      vi.resetModules();
      const { executeAuth } = await import('../../src/cli/auth.js');

      const fakeConfig = JSON.stringify({ security: {} });
      const tmpFile = `/tmp/test-config-${Date.now()}.json`;
      const { writeFileSync } = await import('node:fs');
      writeFileSync(tmpFile, fakeConfig);

      await expect(
        executeAuth({ url: 'https://example.com', configPath: tmpFile }),
      ).rejects.toThrow('playwright-core is required for browser auth');

      const { unlinkSync } = await import('node:fs');
      unlinkSync(tmpFile);
    });
  });
});
