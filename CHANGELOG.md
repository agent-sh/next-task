# Changelog

## [Unreleased]

### Added

- Pre-fetch repo-intel at 3 phase boundaries (exploration, pre-review gates, review loop) to provide risk context without blocking agents
- Ask user to generate repo-intel in orchestrate-review and validate-delivery skills when no repo-intel map exists

### Changed

- Integrate repo-intel across /next-task workflow (hotspots, bugspots, diff-risk, test-gaps)

## [1.1.0] - 2026-03-14

### Added

- simplify as conditional pre-review gate (parallel with deslop and test-coverage-checker)
- Support project-level base branch override via `--base=BRANCH` argument

### Fixed

- Use Skill tool for /simplify instead of subagent Task
- Guard cached source check against preference file without source field

## [1.0.0] - 2026-02-21

Initial release. Extracted from [agentsys](https://github.com/agent-sh/agentsys) monorepo.
