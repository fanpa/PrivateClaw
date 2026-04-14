import { Marked } from 'marked';
import { markedTerminal } from 'marked-terminal';

export function renderMarkdown(text: string): string {
  const width = process.stdout.columns || 80;
  const m = new Marked();
  // Let cli-table3 auto-size columns (no colWidths) to avoid CJK double-width truncation.
  // wordWrap ensures long content wraps instead of overflowing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  m.use(markedTerminal({ width, tableOptions: { wordWrap: true } }) as any);
  return m.parse(text) as string;
}
