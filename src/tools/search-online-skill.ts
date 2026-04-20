import { z } from 'zod';
import { defineTool } from './define-tool.js';

interface SkillIndexEntry {
  name: string;
  description: string;
}

interface SearchResult {
  skills?: SkillIndexEntry[];
  error?: string;
}

export interface SimpleFetchResult {
  status?: number;
  body?: string;
  error?: string;
}

export type SimpleFetchFn = (url: string) => Promise<SimpleFetchResult>;

const parameters = z.object({
  query: z.string().optional().describe('Optional search keyword to filter skills by name or description'),
});

export function parseSkillIndex(markdown: string): SkillIndexEntry[] {
  const lines = markdown.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|'));
  const skills: SkillIndexEntry[] = [];

  for (const line of lines) {
    if (line.includes('---')) continue;
    const cells = line.split('|').map((c) => c.trim()).filter((c) => c.length > 0);
    if (cells.length >= 2) {
      const name = cells[0].toLowerCase();
      if (name === 'name') continue;
      skills.push({ name: cells[0], description: cells[1] });
    }
  }

  return skills;
}

export function toRawUrl(repoUrl: string, path: string): string {
  const cleaned = repoUrl.replace(/\/$/, '');
  const match = cleaned.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (match) {
    return `https://raw.githubusercontent.com/${match[1]}/${match[2]}/main/${path}`;
  }
  return `${cleaned}/${path}`;
}

async function doSearch(
  marketUrl: string | undefined,
  fetchFn: SimpleFetchFn,
  query?: string,
): Promise<SearchResult> {
  if (!marketUrl) {
    return { error: 'Skill market URL is not configured. Set skillMarketUrl in config file.' };
  }

  const indexUrl = toRawUrl(marketUrl, 'index.md');
  const result = await fetchFn(indexUrl);

  if (result.error) {
    return { error: `Cannot reach skill market at ${indexUrl}: ${result.error}` };
  }
  if (result.status !== undefined && (result.status < 200 || result.status >= 300)) {
    return {
      error:
        `Cannot reach skill market at ${indexUrl}: HTTP ${result.status}. ` +
        `Verify skillMarketUrl points to a repository that has index.md on the main branch. ` +
        `If the repository is private, use set_header to add an Authorization header for raw.githubusercontent.com.`,
    };
  }
  if (!result.body) {
    return { error: `Skill market at ${indexUrl} returned an empty response.` };
  }

  let skills = parseSkillIndex(result.body);

  if (query) {
    const q = query.toLowerCase();
    skills = skills.filter(
      (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
    );
  }

  return { skills };
}

export function createSearchOnlineSkillTool(
  marketUrl: string | undefined,
  fetchFn: SimpleFetchFn,
) {
  return defineTool({
    name: 'search_online_skill' as const,
    description: 'Search for skills in the online skill market repository.',
    toolDescription: 'Search the online skill market for available skills. Returns a list of skill names and descriptions. Optionally filter by keyword.',
    parameters,
    execute: async ({ query }): Promise<SearchResult> => doSearch(marketUrl, fetchFn, query),
  });
}
