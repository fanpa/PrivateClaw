import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../../src/cli/markdown.js';

describe('renderMarkdown', () => {
  it('renders plain text unchanged', () => {
    const result = renderMarkdown('Hello world');
    expect(result).toContain('Hello world');
  });

  it('renders bold text', () => {
    const result = renderMarkdown('**bold**');
    expect(result).toContain('bold');
  });

  it('renders code blocks', () => {
    const result = renderMarkdown('```js\nconsole.log("hi")\n```');
    expect(result).toContain('console.log');
  });
});
