import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
marked.use(markedTerminal() as any);

export function renderMarkdown(text: string): string {
  return marked.parse(text) as string;
}
