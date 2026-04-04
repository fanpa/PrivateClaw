import { readFileSync } from 'node:fs';
import { ConfigSchema, type Config } from './schema.js';

export function loadConfig(filePath: string): Config {
  const raw = readFileSync(filePath, 'utf-8');
  const json = JSON.parse(raw);
  return ConfigSchema.parse(json);
}
