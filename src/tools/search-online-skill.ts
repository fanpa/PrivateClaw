import { z } from 'zod';
import type { SkillIndexEntry } from '../skills/types.js';
import { defineTool } from './define-tool.js';

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
  tags: z
    .array(z.string())
    .optional()
    .describe(
      'Lowercase tags representing the user intent (e.g. ["email", "notify"]). Tags are OR-matched — a skill returns if it carries at least one of the provided tags. Skills with no tags are considered universal and always returned. Omit to list every skill.',
    ),
});

function splitCommaList(cell: string | undefined): string[] {
  if (!cell) return [];
  return cell
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v.length > 0);
}

/**
 * Parse the market's `index.md`. Accepts up to 5 columns positionally:
 *   | Name | Description | Tags | Version | Dependencies |
 * Older 2/3/4-column markets still parse — missing trailing columns default
 * to empty. A row is rejected if it has fewer than 2 cells.
 */
export function parseSkillIndex(markdown: string): SkillIndexEntry[] {
  const lines = markdown.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|'));
  const skills: SkillIndexEntry[] = [];

  for (const line of lines) {
    if (line.includes('---')) continue;

    // A markdown table row is framed by leading and trailing `|`. Drop those
    // framing slots; keep the interior cells even when empty.
    const raw = line.split('|').map((c) => c.trim());
    const cells = raw.slice(1, -1);
    if (cells.length < 2) continue;

    const name = cells[0];
    const description = cells[1];
    if (!name || name.toLowerCase() === 'name') continue;

    skills.push({
      name,
      description,
      tags: splitCommaList(cells[2]),
      version: cells[3] && cells[3].length > 0 ? cells[3] : undefined,
      dependencies: splitCommaList(cells[4]),
    });
  }

  return skills;
}

/**
 * Convert a repo URL to a raw-content URL for a given path.
 *
 * - `github.com` → `raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}`
 * - `{host}/{owner}/{repo}` (GHE) → `{host}/{owner}/{repo}/raw/{branch}/{path}`
 * - Anything else → `{url}/{path}` fallback.
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

export function matchesTags(skill: SkillIndexEntry, queryTags: readonly string[] | undefined): boolean {
  if (!queryTags || queryTags.length === 0) return true;
  if (skill.tags.length === 0) return true; // universal / uncategorised
  const normalized = queryTags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0);
  if (normalized.length === 0) return true;
  return normalized.some((qt) => skill.tags.includes(qt));
}

async function doSearch(
  marketUrl: string | undefined,
  fetchFn: SimpleFetchFn,
  branch: string,
  tags?: string[],
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

  const skills = parseSkillIndex(result.body).filter((s) => matchesTags(s, tags));
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
    toolDescription:
      'Search the online skill market by tags. Infer one or more lowercase tags from the user intent (e.g. "이메일 보내는 스킬" → ["email", "send"]) and pass them in `tags`. Tags are OR-matched, so listing several broadens the search. Skills with no tags are universal and always returned. Omit the `tags` parameter to list every skill.',
    parameters,
    execute: async ({ tags }): Promise<SearchResult> => doSearch(marketUrl, fetchFn, branch, tags),
  });
}
