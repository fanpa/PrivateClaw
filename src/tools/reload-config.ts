import { z } from 'zod';
import { defineTool } from './define-tool.js';

interface ReloadResult {
  success?: boolean;
  message?: string;
  error?: string;
}

const parameters = z.object({});

export function createReloadConfigTool(onReload: () => Promise<string | null>) {
  return defineTool({
    name: 'reload_config' as const,
    description: 'Reload the configuration file to apply changes made via file_write.',
    toolDescription: 'Reload the configuration file. Use this after modifying privateclaw.config.json with file_write to apply changes immediately.',
    parameters,
    execute: async (): Promise<ReloadResult> => {
      try {
        const errorMsg = await onReload();
        if (errorMsg) return { error: errorMsg };
        return { success: true, message: 'Config reloaded successfully.' };
      } catch (err) {
        return { error: `Reload failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  });
}
