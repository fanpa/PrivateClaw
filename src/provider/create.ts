import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOllama } from 'ollama-ai-provider';
import type { LanguageModelV1 } from 'ai';
import type { ProviderConfig } from '../config/schema.js';

export interface ProviderResult {
  model: LanguageModelV1;
  provider: string;
}

export function createProvider(config: ProviderConfig): ProviderResult {
  switch (config.type) {
    case 'openai': {
      const openai = createOpenAI({
        baseURL: config.baseURL,
        apiKey: config.apiKey ?? '',
      });
      return { model: openai(config.model), provider: 'openai' };
    }
    case 'anthropic': {
      const anthropic = createAnthropic({
        baseURL: config.baseURL,
        apiKey: config.apiKey ?? '',
      });
      return { model: anthropic(config.model), provider: 'anthropic' };
    }
    case 'ollama': {
      const ollama = createOllama({
        baseURL: config.baseURL,
      });
      return { model: ollama(config.model), provider: 'ollama' };
    }
    default:
      throw new Error(`Unsupported provider: ${(config as ProviderConfig).type}`);
  }
}
