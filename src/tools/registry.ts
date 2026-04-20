import { createFileReadTool } from './file-read.js';
import { fileWriteTool } from './file-write.js';
import { fileUpdateTool } from './file-update.js';
import { createShellExecTool } from './shell-exec.js';
import { createWebFetchTool } from './web-fetch.js';
import { createApiCallTool } from './api-call.js';
import { createUseSkillTool } from './use-skill.js';
import { createCreateSkillTool } from './create-skill.js';
import { createSetHeaderTool } from './set-header.js';
import { createReloadConfigTool } from './reload-config.js';
import { createBrowserAuthTool } from './browser-auth.js';
import { createSyncSkillsTool } from './sync-skills.js';
import { createSearchOnlineSkillTool } from './search-online-skill.js';
import type { SimpleFetchResult } from './search-online-skill.js';
import { createInstallOnlineSkillTool } from './install-online-skill.js';
import { createDelegateTool } from './delegate.js';
import type { SpecialistEntry } from './delegate.js';
import type { ApprovalDecision } from '../approval/types.js';
import type { SkillConfig } from '../skills/types.js';

export interface PreReflectResult {
  proceed: boolean;
  message: string; // explanation if proceed, rejection reason if not
}

export interface BuiltinToolsOptions {
  fetchFn?: typeof globalThis.fetch;
  defaultHeaders?: Record<string, Record<string, string>>;
  skills?: SkillConfig[];
  skillsDir?: string;
  configPath?: string;
  specialists?: SpecialistEntry[];
  onReload?: () => Promise<string | null>;
  onApproval?: (toolName: string, args: unknown) => Promise<ApprovalDecision>;
  onPreReflect?: (toolName: string, args: unknown) => Promise<PreReflectResult>;
  skillMarketUrl?: string;
  allowedCommands?: string[];
  onBeforeToolExecute?: () => Promise<void>;
  generateDescription?: (content: string) => Promise<string>;
}

// Tools that skip pre-reflection (low-risk or meta tools)
const SKIP_PRE_REFLECT = new Set([
  'use_skill', 'reload_config', 'sync_skills', 'file_read',
]);

// Tools that skip approval prompts (meta/read-only tools that don't touch
// user files, shell, or the network).
const SKIP_APPROVAL = new Set([
  'use_skill', 'reload_config', 'sync_skills',
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrapWithApproval(
  toolName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool: any,
  opts: {
    onApproval?: BuiltinToolsOptions['onApproval'];
    onBeforeToolExecute?: BuiltinToolsOptions['onBeforeToolExecute'];
    onPreReflect?: BuiltinToolsOptions['onPreReflect'];
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const originalExecute = tool.execute as (args: unknown, options: unknown) => Promise<unknown>;
  return {
    ...tool,
    execute: async (args: unknown, executeOptions: unknown) => {
      await opts.onBeforeToolExecute?.();
      // Pre-reflection: validate tool choice and show explanation
      if (opts.onPreReflect && !SKIP_PRE_REFLECT.has(toolName)) {
        const result = await opts.onPreReflect(toolName, args);
        if (!result.proceed) {
          return { error: `${result.message} Reconsider your approach.` };
        }
        // result.message is the explanation — displayed by the callback
      }
      if (opts.onApproval && !SKIP_APPROVAL.has(toolName)) {
        const decision = await opts.onApproval(toolName, args);
        if (decision === 'deny') {
          return { error: 'Tool execution denied by user.' };
        }
      }
      return originalExecute(args, executeOptions);
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getBuiltinTools(options: BuiltinToolsOptions = {}): Record<string, any> {
  const f = options.fetchFn ?? globalThis.fetch;
  const webFetch = createWebFetchTool(f);
  const apiCall = createApiCallTool(f, options.defaultHeaders ?? {});
  const shellExec = createShellExecTool(options.allowedCommands ?? []);
  const fileRead = createFileReadTool(options.skillsDir ? [options.skillsDir] : []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Record<string, any> = {
    [fileRead.name]: fileRead.tool,
    [fileWriteTool.name]: fileWriteTool.tool,
    [fileUpdateTool.name]: fileUpdateTool.tool,
    [shellExec.name]: shellExec.tool,
    [webFetch.name]: webFetch.tool,
    [apiCall.name]: apiCall.tool,
  };

  if (options.skills && options.skills.length > 0) {
    const useSkill = createUseSkillTool(options.skills, options.skillsDir ?? './skills');
    tools[useSkill.name] = useSkill.tool;
  }

  if (options.configPath) {
    const createSkill = createCreateSkillTool(
      options.skillsDir ?? './skills',
      options.configPath,
    );
    tools[createSkill.name] = createSkill.tool;
    const setHeader = createSetHeaderTool(options.configPath);
    tools[setHeader.name] = setHeader.tool;
    const syncSkills = createSyncSkillsTool(options.configPath, options.skillsDir ?? './skills', options.generateDescription);
    tools[syncSkills.name] = syncSkills.tool;

    // Skill market tools — fetch wrapper injects defaultHeaders for auth
    const headers = options.defaultHeaders ?? {};
    const marketFetch = async (url: string): Promise<SimpleFetchResult> => {
      try {
        const hostname = new URL(url).hostname;
        const extra = headers[hostname] ?? {};
        const response = await f(url, {
          headers: Object.keys(extra).length > 0 ? extra : undefined,
        });
        const body = await response.text();
        return { status: response.status, body };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    };

    const searchOnlineSkill = createSearchOnlineSkillTool(options.skillMarketUrl, marketFetch);
    tools[searchOnlineSkill.name] = searchOnlineSkill.tool;

    const installOnlineSkill = createInstallOnlineSkillTool({
      marketUrl: options.skillMarketUrl,
      skillsDir: options.skillsDir ?? './skills',
      configPath: options.configPath,
      fetchFn: marketFetch,
    });
    tools[installOnlineSkill.name] = installOnlineSkill.tool;
  }

  {
    const browserAuth = createBrowserAuthTool();
    tools[browserAuth.name] = browserAuth.tool;
  }

  if (options.specialists && options.specialists.length > 0) {
    const delegate = createDelegateTool(options.specialists);
    tools[delegate.name] = delegate.tool;
  }

  if (options.onReload) {
    const reloadConfig = createReloadConfigTool(options.onReload);
    tools[reloadConfig.name] = reloadConfig.tool;
  }

  if (options.onApproval || options.onBeforeToolExecute || options.onPreReflect) {
    for (const name of Object.keys(tools)) {
      tools[name] = wrapWithApproval(name, tools[name], {
        onApproval: options.onApproval,
        onBeforeToolExecute: options.onBeforeToolExecute,
        onPreReflect: options.onPreReflect,
      });
    }
  }

  return tools;
}
