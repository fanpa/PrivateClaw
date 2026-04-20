import type { LanguageModel } from 'ai';
import { createProvider } from './create.js';
import type { ProviderConfig } from '../config/schema.js';

interface ProviderState {
  model: LanguageModel;
  providerName: string;
  fetch: typeof globalThis.fetch | null;
}

let state: ProviderState | null = null;

export function initProvider(config: ProviderConfig, fetch?: typeof globalThis.fetch): void {
  const { model, provider } = createProvider(fetch ? { config, fetch } : config);
  state = { model, providerName: provider, fetch: fetch ?? null };
}

export function getModel(): LanguageModel {
  if (!state) {
    throw new Error('Provider not initialized. Call initProvider() first.');
  }
  return state.model;
}

export function getProviderName(): string {
  if (!state) {
    throw new Error('Provider not initialized. Call initProvider() first.');
  }
  return state.providerName;
}

export function getRestrictedFetch(): typeof globalThis.fetch {
  return state?.fetch ?? globalThis.fetch;
}
