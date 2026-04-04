import type { LanguageModelV1 } from 'ai';
import { createProvider } from './create.js';
import type { ProviderConfig } from '../config/schema.js';

let currentModel: LanguageModelV1 | null = null;
let currentProviderName: string | null = null;

export function initProvider(config: ProviderConfig): void {
  const { model, provider } = createProvider(config);
  currentModel = model;
  currentProviderName = provider;
}

export function getModel(): LanguageModelV1 {
  if (!currentModel) {
    throw new Error('Provider not initialized. Call initProvider() first.');
  }
  return currentModel;
}

export function getProviderName(): string {
  if (!currentProviderName) {
    throw new Error('Provider not initialized. Call initProvider() first.');
  }
  return currentProviderName;
}
