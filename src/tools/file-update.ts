import { z } from 'zod';
import { readFile, writeFile, access } from 'node:fs/promises';
import { defineTool } from './define-tool.js';

interface FileUpdateResult {
  message: string;
  diff: string;
}

type DiffOp = { type: 'eq' | 'del' | 'add'; line: string };

const CONTEXT_LINES = 3;

function buildLcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

function diffOps(a: string[], b: string[]): DiffOp[] {
  const dp = buildLcsTable(a, b);
  const ops: DiffOp[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      ops.push({ type: 'eq', line: a[i - 1] });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      ops.push({ type: 'del', line: a[i - 1] });
      i--;
    } else {
      ops.push({ type: 'add', line: b[j - 1] });
      j--;
    }
  }
  while (i > 0) ops.push({ type: 'del', line: a[--i] });
  while (j > 0) ops.push({ type: 'add', line: b[--j] });
  return ops.reverse();
}

function computeDiff(oldContent: string, newContent: string): string {
  if (oldContent === newContent) return '';

  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const ops = diffOps(oldLines, newLines);

  const changeIdx: number[] = [];
  for (let k = 0; k < ops.length; k++) {
    if (ops[k].type !== 'eq') changeIdx.push(k);
  }
  if (changeIdx.length === 0) return '';

  const clusters: Array<{ start: number; end: number }> = [];
  let start = Math.max(0, changeIdx[0] - CONTEXT_LINES);
  let end = Math.min(ops.length - 1, changeIdx[0] + CONTEXT_LINES);
  for (let k = 1; k < changeIdx.length; k++) {
    const nextStart = Math.max(0, changeIdx[k] - CONTEXT_LINES);
    if (nextStart <= end + 1) {
      end = Math.min(ops.length - 1, changeIdx[k] + CONTEXT_LINES);
    } else {
      clusters.push({ start, end });
      start = nextStart;
      end = Math.min(ops.length - 1, changeIdx[k] + CONTEXT_LINES);
    }
  }
  clusters.push({ start, end });

  const lines: string[] = [];
  let aCursor = 0;
  let bCursor = 0;
  let opIdx = 0;
  for (const cluster of clusters) {
    while (opIdx < cluster.start) {
      const op = ops[opIdx++];
      if (op.type !== 'add') aCursor++;
      if (op.type !== 'del') bCursor++;
    }
    const aStart = aCursor + 1;
    const bStart = bCursor + 1;
    let aCount = 0;
    let bCount = 0;
    const body: string[] = [];
    while (opIdx <= cluster.end) {
      const op = ops[opIdx++];
      if (op.type === 'eq') {
        body.push(` ${op.line}`);
        aCursor++;
        bCursor++;
        aCount++;
        bCount++;
      } else if (op.type === 'del') {
        body.push(`-${op.line}`);
        aCursor++;
        aCount++;
      } else {
        body.push(`+${op.line}`);
        bCursor++;
        bCount++;
      }
    }
    lines.push(`@@ -${aCount === 0 ? 0 : aStart},${aCount} +${bCount === 0 ? 0 : bStart},${bCount} @@`);
    lines.push(...body);
  }

  return lines.join('\n');
}

const parameters = z.object({
  filePath: z.string().describe('Absolute path to the existing file to update'),
  content: z.string().describe('New content to overwrite the file with'),
});

export const fileUpdateTool = defineTool({
  name: 'file_update' as const,
  description:
    'Overwrite an existing file with new content. Fails if the file does not exist. Use file_write to create new files.',
  parameters,
  execute: async ({ filePath, content }): Promise<FileUpdateResult> => {
    await access(filePath);
    const oldContent = await readFile(filePath, 'utf-8');
    await writeFile(filePath, content, 'utf-8');
    return {
      message: `Updated ${content.length} bytes in ${filePath}`,
      diff: computeDiff(oldContent, content),
    };
  },
});
