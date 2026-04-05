import { z } from 'zod';

const ProviderSchema = z.object({
  type: z.enum(['openai', 'anthropic', 'ollama']),
  baseURL: z.string().url(),
  apiKey: z.string().optional(),
  model: z.string(),
});

const SecuritySchema = z.object({
  allowedDomains: z.array(z.string()).default([]),
  defaultHeaders: z.record(z.record(z.string())).default({}),
});

const SessionSchema = z.object({
  dbPath: z.string().default('./privateclaw-sessions.db'),
});

const SkillEntrySchema = z.object({
  name: z.string(),
  description: z.string(),
});

export const ConfigSchema = z.object({
  provider: ProviderSchema,
  security: SecuritySchema.default({}),
  session: SessionSchema.default({}),
  skills: z.array(SkillEntrySchema).default([]),
  skillsDir: z.string().default('./skills'),
});

export type Config = z.infer<typeof ConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderSchema>;
export type SecurityConfig = z.infer<typeof SecuritySchema>;
export type SessionConfig = z.infer<typeof SessionSchema>;
