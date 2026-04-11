# Changelog

## [Unreleased]

## [1.1.1] - 2026-04-11

### Fixed

- SubagentStop hook now only fires during active /next-task workflows - previously fired on every subagent stop, wasting 136K+ tokens per unrelated agent
- Switched hook from unconditional `prompt` type to guarded `command` type with Node.js script for cross-platform support
- Added `getStateDirPath()` usage and `flow.phase` fallback per auto-reviewer feedback

### Added

- Test suite for hook guard (12 tests covering no-op and active workflow cases)
- `npm test` script using `node:test` (zero dependencies)

## [1.1.0]

### Added

- Pre-fetch repo-intel at 3 phase boundaries (exploration, pre-review gates, review loop) to provide risk context without blocking agents
- Ask user to generate repo-intel in orchestrate-review and validate-delivery skills when no repo-intel map exists
- Wire symbol exports (blast-radius) query into exploration-agent - reported as 'Symbol Exports' section and forwarded in repoIntel state for planning
- Wire painspots into planning-agent risk signals - files intersecting top-10 painspots flagged in Data-Backed Risk Signals section with CRITICAL threshold at painScore > 2.0
- Conventions query in exploration-agent Phase 4 for coding style matching

### Changed

- Decouple delivery-validator and test-coverage-checker agents and orchestrate-review and validate-delivery skills to the prepare-delivery plugin - next-task now references these as `prepare-delivery:*`
- Update all internal cross-plugin references from `next-task:delivery-validator` and `next-task:test-coverage-checker` to `prepare-delivery:*` equivalents
- Rename git-map/repo-map plugin references to repo-intel across agent prompts and user-facing suggestions
- Integrate repo-intel across /next-task workflow (hotspots, bugspots, diff-risk, test-gaps)
- Downgrade exploration-agent from Opus to Sonnet - pre-fetched repo-intel data makes the agent a data curator rather than a deep analyst; planning-agent remains Opus
- Replace inline state dir detections with `getStateDirPath()` from agent-core for consistent platform-aware paths

### Fixed

- Add `console.warn` to query helper and symbols catch blocks for debuggability
- Remove stale AUTO-GENERATED comment and redundant 'Be concise' instruction

### Docs

- Add prepare-delivery to Cross-Plugin Dependencies table in README
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
