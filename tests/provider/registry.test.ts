import { describe, it, expect } from 'vitest';
import { createProvider } from '../../src/provider/create.js';
import type { ProviderConfig } from '../../src/config/schema.js';

describe('createProvider', () => {
  it('creates an OpenAI provider with custom baseURL', () => {
    const config: ProviderConfig = {
      type: 'openai',
      baseURL: 'http://internal-llm:8080/v1',
      apiKey: 'test-key',
      model: 'gpt-4o',
    };
    const { model, provider } = createProvider(config);
    expect(model).toBeDefined();
    expect(provider).toBe('openai');
  });

  it('creates an Anthropic provider with custom baseURL', () => {
    const config: ProviderConfig = {
      type: 'anthropic',
      baseURL: 'http://internal-llm:8081/v1',
      apiKey: 'test-key',
      model: 'claude-sonnet-4-20250514',
    };
    const { model, provider } = createProvider(config);
    expect(model).toBeDefined();
    expect(provider).toBe('anthropic');
  });

  it('creates an Ollama provider with custom baseURL', () => {
    const config: ProviderConfig = {
      type: 'ollama',
      baseURL: 'http://localhost:11434/api',
      model: 'llama3.2',
    };
    const { model, provider } = createProvider(config);
    expect(model).toBeDefined();
    expect(provider).toBe('ollama');
  });

  it('throws on unsupported provider type', () => {
    const config = {
      type: 'unsupported' as 'openai',
      baseURL: 'http://localhost:8080/v1',
      model: 'test',
    };
    expect(() => createProvider(config)).toThrow('Unsupported provider');
  });
});
