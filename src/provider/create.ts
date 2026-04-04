import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '../config/schema.js';

export interface ProviderResult {
  model: LanguageModel;
  provider: string;
}

export interface CreateProviderOptions {
  config: ProviderConfig;
  fetch?: typeof globalThis.fetch;
}

export function createProvider(configOrOptions: ProviderConfig | CreateProviderOptions): ProviderResult {
  const config = 'config' in configOrOptions ? configOrOptions.config : configOrOptions;
  const customFetch = 'config' in configOrOptions ? configOrOptions.fetch : undefined;

  switch (config.type) {
    case 'openai': {
      const openai = createOpenAI({
        baseURL: config.baseURL,
        apiKey: config.apiKey ?? '',
        fetch: customFetch,
      });
      return { model: openai(config.model), provider: 'openai' };
    }
    case 'anthropic': {
      const anthropic = createAnthropic({
        baseURL: config.baseURL,
        apiKey: config.apiKey ?? '',
        fetch: customFetch,
      });
      return { model: anthropic(config.model), provider: 'anthropic' };
    }
    case 'ollama': {
      // Ollama exposes an OpenAI-compatible API at /v1
      const baseURL = config.baseURL.replace(/\/api\/?$/, '/v1');
      const ollama = createOpenAI({
        baseURL,
        apiKey: 'ollama',
        fetch: customFetch,
      });
      return { model: ollama(config.model), provider: 'ollama' };
    }
    default:
      throw new Error(`Unsupported provider: ${(config as ProviderConfig).type}`);
  }
}
