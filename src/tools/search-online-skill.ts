import { z } from 'zod';

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

/**
 * Parse a markdown table from index.md into skill entries.
 * Expected format: | Name | Description |
 */
export function parseSkillIndex(markdown: string): SkillIndexEntry[] {
  const lines = markdown.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|'));
  const skills: SkillIndexEntry[] = [];

  for (const line of lines) {
    // Skip header and separator rows
    if (line.includes('---')) continue;
    const cells = line.split('|').map((c) => c.trim()).filter((c) => c.length > 0);
    if (cells.length >= 2) {
      const name = cells[0].toLowerCase();
      if (name === 'name') continue; // header row
      skills.push({ name: cells[0], description: cells[1] });
    }
  }

  return skills;
}

/**
 * Convert a GitHub repo URL to the raw content URL for a given path.
 */
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

  if (result.error || !result.body) {
    return { error: `Failed to fetch skill index: ${result.error ?? 'empty response'}` };
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
  return {
    name: 'search_online_skill' as const,
    description: 'Search for skills in the online skill market repository.',
    tool: {
      description: 'Search the online skill market for available skills. Returns a list of skill names and descriptions. Optionally filter by keyword.',
      inputSchema: parameters,
      execute: async ({ query }: z.infer<typeof parameters>): Promise<SearchResult> => {
        return doSearch(marketUrl, fetchFn, query);
      },
    },
    execute: async (params: { query?: string }): Promise<SearchResult> => {
      return doSearch(marketUrl, fetchFn, params.query);
    },
  };
}
