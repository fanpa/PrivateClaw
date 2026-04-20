import type { z } from 'zod';

export interface ToolDefinitionInput<TSchema extends z.ZodTypeAny, TResult> {
  name: string;
  description: string;
  parameters: TSchema;
  execute: (args: z.infer<TSchema>) => Promise<TResult>;
  toolDescription?: string;
}

export interface DefinedTool<TSchema extends z.ZodTypeAny, TResult> {
  readonly name: string;
  readonly description: string;
  readonly tool: {
    readonly description: string;
    readonly inputSchema: TSchema;
    execute: (args: z.infer<TSchema>, options: unknown) => Promise<TResult>;
  };
  execute: (args: z.infer<TSchema>) => Promise<TResult>;
}

export function defineTool<TSchema extends z.ZodTypeAny, TResult>(
  def: ToolDefinitionInput<TSchema, TResult>,
): DefinedTool<TSchema, TResult> {
  const run = def.execute;
  return {
    name: def.name,
    description: def.description,
    tool: {
      description: def.toolDescription ?? def.description,
      inputSchema: def.parameters,
      execute: (args) => run(args as z.infer<TSchema>),
    },
    execute: run,
  };
}
