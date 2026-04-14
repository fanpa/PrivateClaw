import { Marked } from 'marked';
import { markedTerminal } from 'marked-terminal';

function computeTableOptions(text: string, consoleWidth: number): Record<string, unknown> {
  // Walk tokens to find max column count across all tables
  let maxCols = 0;
  const scanner = new Marked();
  scanner.use({
    walkTokens(token: { type: string; header?: unknown[] }) {
      if (token.type === 'table' && Array.isArray(token.header)) {
        maxCols = Math.max(maxCols, token.header.length);
      }
    },
  });
  scanner.parse(text);

  if (maxCols === 0) return {};

  // cli-table3: total width = sum(colWidths) + (numCols + 1) borders
  // Each colWidth includes 1-space padding on each side (so visible content = colWidth - 2)
  const borders = maxCols + 1;
  const available = consoleWidth - borders;
  const colWidth = Math.max(12, Math.floor(available / maxCols));
  return {
    colWidths: Array(maxCols).fill(colWidth),
    wordWrap: true,
    wrapOnWordBoundary: false,
  };
}

export function renderMarkdown(text: string): string {
  const width = process.stdout.columns || 80;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = new Marked();
  const tableOptions = computeTableOptions(text, width);
  m.use(markedTerminal({ width, tableOptions }) as any);
  return m.parse(text) as string;
}
