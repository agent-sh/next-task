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
/next-task --base develop               # Target a non-default branch
```

## How It Works

The workflow has 12 phases. Phases 1-6 involve the user; phases 7-12 run autonomously.

| Phase | Name | Agent | Model |
|-------|------|-------|-------|
| 1 | Policy Selection | - | - |
| 2 | Task Discovery | task-discoverer | Sonnet |
| 3 | Worktree Setup | worktree-manager | Haiku |
| 4 | Exploration | exploration-agent | Sonnet |
| 5 | Planning | planning-agent | Opus |
| 6 | User Approval | - | - |
| 7 | Implementation | implementation-agent | Opus |
| 8 | Pre-Review Gates | deslop:deslop-agent + prepare-delivery:test-coverage-checker | Sonnet |
| 9 | Review Loop | 4+ parallel reviewers | Sonnet |
| 10 | Delivery Validation | prepare-delivery:delivery-validator | Sonnet |
| 11 | Docs Update | sync-docs:sync-docs-agent | Sonnet |
| 12 | Ship | ship:ship | - |

**Human interaction happens exactly three times:** source/priority selection (Phase 1), task selection (Phase 2), and plan approval (Phase 6). Everything after Phase 6 is autonomous.

### Phase highlights

**Task discovery** (Phase 2) fetches from GitHub Issues, GitHub Projects, GitLab, or local markdown files. Issues with open PRs are automatically excluded. Tasks are scored by priority labels, severity, and age.

**Worktree isolation** (Phase 3) creates a git worktree per task so multiple workflows can run in parallel without conflicts.

**Multi-agent review** (Phase 9) spawns 4 core reviewers in parallel - code quality, security, performance, and test coverage - plus conditional specialists (database, API, frontend, backend, devops, architecture) based on which files changed. Runs up to 5 iterations with stall detection.

**Pre-review gates** (Phase 8) run deslop (AI slop cleanup) and test coverage checks in parallel before the review loop starts.

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
| [deslop](https://github.com/agent-sh/deslop) | Phase 8 - AI slop cleanup |
| [prepare-delivery](https://github.com/agent-sh/prepare-delivery) | Phases 8-10 - test coverage, review orchestration, delivery validation |
| [sync-docs](https://github.com/agent-sh/sync-docs) | Phase 11 - documentation sync |
| [ship](https://github.com/agent-sh/ship) | Phase 12 - PR creation, CI, merge |

## Related Plugins

- [ship](https://github.com/agent-sh/ship) - standalone PR and release workflow
- [enhance](https://github.com/agent-sh/enhance) - plugin structure and config analysis
- [audit-project](https://github.com/agent-sh/audit-project) - multi-agent code review (standalone)

## License

MIT
