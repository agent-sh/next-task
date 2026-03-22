# Changelog

## [Unreleased]

### Added

- Pre-fetch repo-intel at 3 phase boundaries (exploration, pre-review gates, review loop) to provide risk context without blocking agents
- Ask user to generate repo-intel in orchestrate-review and validate-delivery skills when no repo-intel map exists
- Wire symbol exports (blast-radius) query into exploration-agent - reported as 'Symbol Exports' section and forwarded in repoIntel state for planning
- Wire painspots into planning-agent risk signals - files intersecting top-10 painspots flagged in Data-Backed Risk Signals section with CRITICAL threshold at painScore > 2.0
- Conventions query in exploration-agent Phase 4 for coding style matching

### Changed

- Integrate repo-intel across /next-task workflow (hotspots, bugspots, diff-risk, test-gaps)
- Downgrade exploration-agent from Opus to Sonnet - pre-fetched repo-intel data makes the agent a data curator rather than a deep analyst; planning-agent remains Opus
- Replace inline state dir detections with `getStateDirPath()` from agent-core for consistent platform-aware paths

### Fixed

- Add `console.warn` to query helper and symbols catch blocks for debuggability
- Remove stale AUTO-GENERATED comment and redundant 'Be concise' instruction

### Docs

- Upgrade README with 12-phase workflow diagram, agent model table, and task sources reference ([#18](https://github.com/agent-sh/next-task/pull/18))

## [1.1.0] - 2026-03-14

### Added

- simplify as conditional pre-review gate (parallel with deslop and test-coverage-checker)
- Support project-level base branch override via `--base=BRANCH` argument

### Fixed

- Use Skill tool for /simplify instead of subagent Task
- Guard cached source check against preference file without source field

## [1.0.0] - 2026-02-21

Initial release. Extracted from [agentsys](https://github.com/agent-sh/agentsys) monorepo.
