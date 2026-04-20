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

/**
 * Convert a repo URL to a raw-content URL for a given path.
 *
 * - `github.com`: returns `https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}`
 * - GitHub Enterprise (any host other than github.com with a `{host}/{owner}/{repo}`
 *   structure): returns `{host}/{owner}/{repo}/raw/{branch}/{path}` — GHE has no
 *   separate raw subdomain and instead serves raw content on the same host.
 * - Any other shape (e.g. a static HTTP server at an arbitrary path) falls back
 *   to `{url}/{path}` so existing non-GitHub setups still work.
 *
 * The branch defaults to `main` and can be overridden via config.
 */
export function toRawUrl(repoUrl: string, path: string, branch: string = 'main'): string {
  const cleaned = repoUrl.replace(/\/$/, '');

  const githubCom = cleaned.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)/);
  if (githubCom) {
    return `https://raw.githubusercontent.com/${githubCom[1]}/${githubCom[2]}/${branch}/${path}`;
  }

  const gheLike = cleaned.match(/^(https?:\/\/[^/]+)\/([^/]+)\/([^/]+)$/);
  if (gheLike) {
    return `${gheLike[1]}/${gheLike[2]}/${gheLike[3]}/raw/${branch}/${path}`;
  }

  return `${cleaned}/${path}`;
}

async function doSearch(
  marketUrl: string | undefined,
  fetchFn: SimpleFetchFn,
  branch: string,
  query?: string,
): Promise<SearchResult> {
  if (!marketUrl) {
    return { error: 'Skill market URL is not configured. Set skillMarketUrl in config file.' };
  }

  const indexUrl = toRawUrl(marketUrl, 'index.md', branch);
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
  branch: string = 'main',
) {
  return defineTool({
    name: 'search_online_skill' as const,
    description: 'Search for skills in the online skill market repository.',
    toolDescription: 'Search the online skill market for available skills. Returns a list of skill names and descriptions. Optionally filter by keyword.',
    parameters,
    execute: async ({ query }): Promise<SearchResult> => doSearch(marketUrl, fetchFn, branch, query),
  });
}
