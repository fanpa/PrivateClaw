import { Marked } from 'marked';
import { markedTerminal } from 'marked-terminal';

export function renderMarkdown(text: string): string {
  const width = process.stdout.columns || 80;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = new Marked();
  m.use(markedTerminal({ width }) as any);
  return m.parse(text) as string;
}
