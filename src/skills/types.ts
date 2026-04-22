export interface SkillConfig {
  name: string;
  description: string;
  version?: string;
}

/**
 * A parsed row from the skill market's `index.md`.
 * Tags/dependencies default to [] and version is optional so legacy 2-column
 * markets continue to parse without loss.
 */
export interface SkillIndexEntry {
  name: string;
  description: string;
  tags: string[];
  version?: string;
  dependencies: string[];
}
