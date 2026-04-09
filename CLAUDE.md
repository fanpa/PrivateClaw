# CLAUDE.md — Project Instructions for Claude Code

## Branch Naming Rules

All branches MUST follow semantic prefix format:

```
<prefix>/<short-description>
```

**Allowed prefixes:** `fix/`, `feat/`, `chore/`, `refactor/`, `docs/`, `test/`, `ci/`

**Examples:**
- `fix/reflection-output-leak`
- `feat/streaming-improvements`
- `chore/bump-deps`

**Prohibited naming patterns:**
- `claude/` prefix (e.g., `claude/distracted-torvalds`) — never use this
- Auto-generated adjective-name combos (e.g., `inspiring-tesla`, `distracted-torvalds`, `vigilant-proskuriakova`) — never use these
- Any branch name without a semantic prefix

This applies to ALL branches created during Claude Code sessions without exception.
