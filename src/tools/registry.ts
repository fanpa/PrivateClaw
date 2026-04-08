import { fileReadTool } from './file-read.js';
import { fileWriteTool } from './file-write.js';
import { bashExecTool } from './bash-exec.js';
import { createWebFetchTool } from './web-fetch.js';
import { createApiCallTool } from './api-call.js';
import { createUseSkillTool } from './use-skill.js';
import type { ApprovalDecision } from '../approval/types.js';
import type { SkillConfig } from '../skills/types.js';

export interface BuiltinToolsOptions {
  fetchFn?: typeof globalThis.fetch;
  defaultHeaders?: Record<string, Record<string, string>>;
  skills?: SkillConfig[];
  skillsDir?: string;
  onApproval?: (toolName: string, args: unknown) => Promise<ApprovalDecision>;
  onBeforeToolExecute?: () => Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrapWithApproval(
  toolName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool: any,
  onApproval: BuiltinToolsOptions['onApproval'],
  onBeforeToolExecute: BuiltinToolsOptions['onBeforeToolExecute'],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const originalExecute = tool.execute as (args: unknown, options: unknown) => Promise<unknown>;
  return {
    ...tool,
    execute: async (args: unknown, executeOptions: unknown) => {
      await onBeforeToolExecute?.();
      if (onApproval) {
        const decision = await onApproval(toolName, args);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Record<string, any> = {
    [fileReadTool.name]: fileReadTool.tool,
    [fileWriteTool.name]: fileWriteTool.tool,
    [bashExecTool.name]: bashExecTool.tool,
    [webFetch.name]: webFetch.tool,
    [apiCall.name]: apiCall.tool,
  };

  if (options.skills && options.skills.length > 0) {
    const useSkill = createUseSkillTool(options.skills, options.skillsDir ?? './skills');
    tools[useSkill.name] = useSkill.tool;
  }

  if (options.onApproval || options.onBeforeToolExecute) {
    for (const name of Object.keys(tools)) {
      tools[name] = wrapWithApproval(name, tools[name], options.onApproval, options.onBeforeToolExecute);
    }
  }

  return tools;
}
