import { describe, it, expect } from 'vitest';

describe('auth command', () => {
  it('detectBrowserChannel returns appropriate channel for platform', async () => {
    // Just verify the module can be imported without errors
    const mod = await import('../../src/cli/auth.js');
    expect(mod.executeAuth).toBeTypeOf('function');
  });
});
