# next-task

Autonomous workflow orchestrator that takes a task from discovery to production through 12 coordinated phases - exploration, planning, implementation, multi-agent review, and shipping.

## Why

Manual development workflows leak time at every handoff: finding the right task, setting up isolated branches, remembering to run tests, reviewing your own code, syncing docs, creating PRs. next-task removes all of that. You select a task and approve a plan; everything after that runs autonomously.

**Use cases:**
- Pick the highest-priority issue from GitHub/GitLab and ship it end-to-end
- Resume an interrupted workflow from exactly where it stopped
- Run parallel workflows in isolated git worktrees

## Installation

```bash
agentsys install next-task
```

Requires [agentsys](https://github.com/agent-sh/agentsys) runtime.

## Quick Start

```
/next-task                              # Start fresh - select source, pick task, approve plan, ship
/next-task --resume                     # Resume active workflow
/next-task --resume 123                 # Resume by task ID
/next-task --resume feature/my-task-123 # Resume by branch name
/next-task --status                     # Show current workflow state
/next-task --abort                      # Cancel and clean up
/next-task bug                          # Filter to bug-labeled issues only
/next-task --base=develop               # Target a non-default branch
```

## How It Works

The workflow has 12 phases. Phases 1-6 involve the user; phases 7-12 run autonomously.

| Phase | Name | Agent | Model |
|-------|------|-------|-------|
| 1 | Policy Selection | - | - |
| 2 | Task Discovery | task-discoverer | Sonnet |
| 3 | Worktree Setup | worktree-manager | Haiku |
| 4 | Exploration | exploration-agent | Sonnet |
| 5 | Planning | planning-agent | Inherits session model |
| 6 | User Approval | - | - |
| 7 | Implementation | implementation-agent | Inherits session model |
| 8 | Pre-Review Gates | deslop:deslop-agent + prepare-delivery:test-coverage-checker | Sonnet |
| 9 | Review Loop | 1 reviewer, up to 4 for large diffs | Sonnet |
| 10 | Delivery Validation | prepare-delivery:delivery-validator | Sonnet |
| 11 | Docs Update | sync-docs:sync-docs-agent | Sonnet |
| 12 | Stopping point | ship:ship, or stop at implemented / PR created | - |

**Human interaction happens exactly three times:** source/priority selection (Phase 1), task selection (Phase 2), and plan approval (Phase 6). Everything after Phase 6 is autonomous.

### Phase highlights

**Task discovery** (Phase 2) fetches from GitHub Issues, GitHub Projects, GitLab, or local markdown files. Issues with open PRs are automatically excluded. Tasks are scored by priority labels, severity, and age.

**Worktree isolation** (Phase 3) creates a git worktree per task so multiple workflows can run in parallel without conflicts.

**Review loop** (Phase 9) sizes the review to the change: one reviewer covering correctness, security, performance, and tests by default, up to 4 parallel reviewers (one per concern, optionally a database, API, frontend, or infra specialist) for large or risky diffs. Critical and high findings are fixed; the loop stops when none remain, on a stall, or after 3 rounds.

**Pre-review gates** (Phase 8) run deslop (AI slop cleanup) and test coverage checks in parallel before the review loop starts.

**Stopping point** (Phase 12) follows the policy answer: stop after implementation, open the PR and stop, or hand off to `/ship` to merge and deploy.

**Works without the companion plugins.** Every cross-plugin step (deslop, prepare-delivery, sync-docs, ship) has an inline fallback, and missing `Task`, `AskUserQuestion`, or plan mode fall back to inline work and plain-text questions.

## Task Sources

| Source | How it works |
|--------|-------------|
| GitHub Issues | `gh issue list` with label-based scoring |
| GitHub Projects | `gh project item-list` (v2 boards) |
| GitLab Issues | `glab issue list` |
| Local file | Scans `PLAN.md`, `tasks.md`, `TODO.md` for unchecked items |
| Custom | CLI, MCP, or Skill tool |

## State Management

Workflow state survives session restarts via two files:

- `{stateDir}/tasks.json` - active task registry (in main repo)
- `{stateDir}/flow.json` - workflow progress (in worktree)

The state directory is platform-aware: `.claude/`, `.opencode/`, or `.codex/`.

## Skills

| Skill | Purpose |
|-------|---------|
| discover-tasks | Fetch, filter, score, and present tasks for selection |

Phases 8-10 use agents from the [prepare-delivery](https://github.com/agent-sh/prepare-delivery) plugin:
`prepare-delivery:test-coverage-checker` (Phase 8), `prepare-delivery:delivery-validator` (Phase 10).

## Requirements

- [agentsys](https://github.com/agent-sh/agentsys) runtime
- Git 2.20+ (worktree support)
- GitHub CLI (`gh`) for GitHub sources, or GitLab CLI (`glab`) for GitLab
- Node.js 18+

## Cross-Plugin Dependencies

| Plugin | Used in |
|--------|---------|
| [deslop](https://github.com/agent-sh/deslop) | Phase 8 - AI slop cleanup (optional, inline fallback) |
| [prepare-delivery](https://github.com/agent-sh/prepare-delivery) | Phases 8 and 10 - test coverage, delivery validation (optional, falls back to /delivery-approval) |
| [sync-docs](https://github.com/agent-sh/sync-docs) | Phase 11 - documentation sync (optional, inline fallback) |
| [ship](https://github.com/agent-sh/ship) | Phase 12 - PR creation, CI, merge (optional, falls back to opening the PR) |

## Related Plugins

- [ship](https://github.com/agent-sh/ship) - standalone PR and release workflow
- [enhance](https://github.com/agent-sh/enhance) - plugin structure and config analysis
- [audit-project](https://github.com/agent-sh/audit-project) - multi-agent code review (standalone)

## License

MIT
