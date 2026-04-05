import { describe, it, expect } from 'vitest';
import { ConfigSchema } from '../../src/config/schema.js';

describe('ConfigSchema', () => {
  it('validates a minimal valid config', () => {
    const config = {
      provider: {
        type: 'openai',
        baseURL: 'http://localhost:8080/v1',
        apiKey: 'test-key',
        model: 'gpt-4o',
      },
    };
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('validates config with all fields', () => {
    const config = {
      provider: {
        type: 'openai',
        baseURL: 'http://localhost:8080/v1',
        apiKey: 'test-key',
        model: 'gpt-4o',
      },
      security: {
        allowedDomains: ['localhost', 'internal.corp.com'],
      },
      session: {
        dbPath: './data/sessions.db',
      },
    };
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('rejects config without provider', () => {
    const result = ConfigSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects config with unknown provider type', () => {
    const config = {
      provider: {
        type: 'unknown-provider',
        baseURL: 'http://localhost:8080/v1',
        model: 'test',
      },
    };
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('defaults security.allowedDomains to empty array', () => {
    const config = {
      provider: {
        type: 'ollama',
        baseURL: 'http://localhost:11434/api',
        model: 'llama3.2',
      },
    };
    const result = ConfigSchema.parse(config);
    expect(result.security.allowedDomains).toEqual([]);
  });

  it('defaults session.dbPath', () => {
    const config = {
      provider: {
        type: 'ollama',
        baseURL: 'http://localhost:11434/api',
        model: 'llama3.2',
      },
    };
    const result = ConfigSchema.parse(config);
    expect(result.session.dbPath).toBe('./privateclaw-sessions.db');
  });
});
