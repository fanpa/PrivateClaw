import { describe, it, expect } from 'vitest';

describe('auth command', () => {
  it('executeAuth is exported as a function', async () => {
    const mod = await import('../../src/cli/auth.js');
    expect(mod.executeAuth).toBeTypeOf('function');
  });
});
