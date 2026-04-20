import { z } from 'zod';

const ProviderSchema = z.object({
  type: z.enum(['openai', 'anthropic', 'ollama', 'google']),
  baseURL: z.string().url().optional(),
  apiKey: z.string().optional(),
  model: z.string(),
  temperature: z.number().min(0).max(2).default(0.7),
  reflectionLoops: z.number().int().min(0).max(5).default(2),
});

const SecuritySchema = z.object({
  allowedDomains: z.array(z.string()).default([]),
  allowedCommands: z.array(z.string()).default([]),
  defaultHeaders: z.record(z.record(z.string())).default({}),
  tlsSkipVerify: z.boolean().default(false),
  tlsCaPath: z.string().optional(),
});

const SessionSchema = z.object({
  sessionDir: z.string().default('./.privateclaw/sessions'),
  maxHistoryMessages: z.number().int().min(0).default(20),
});

const SkillEntrySchema = z.object({
  name: z.string(),
  description: z.string(),
});

const SpecialistSchema = z.object({
  role: z.string(),
  type: z.enum(['openai', 'anthropic', 'ollama', 'google']),
  baseURL: z.string().url().optional(),
  apiKey: z.string().optional(),
  model: z.string(),
  description: z.string(),
});

export const ConfigSchema = z.object({
  provider: ProviderSchema,
  security: SecuritySchema.default({}),
  session: SessionSchema.default({}),
  skills: z.array(SkillEntrySchema).default([]),
  skillsDir: z.string().default('./skills'),
  skillMarketUrl: z.string().optional(),
  skillMaxDepth: z.number().int().min(1).max(20).default(5),
  specialists: z.array(SpecialistSchema).default([]),
});

export type Config = z.infer<typeof ConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderSchema>;
export type SecurityConfig = z.infer<typeof SecuritySchema>;
export type SessionConfig = z.infer<typeof SessionSchema>;
export type SpecialistConfig = z.infer<typeof SpecialistSchema>;
