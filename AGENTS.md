# next-task

> Master workflow orchestrator with autonomous task-to-production automation, quality gates, and multi-agent review

## Overview

An agentsys plugin: Markdown prompts in `commands/`, `agents/` and `skills/`, a `SubagentStop` guard in `hooks/`, and Node.js helpers in `lib/` (workflow state, task sources, platform detection). Plain CommonJS, no build step, tests use `node:test`. `lib/` is synced from [agent-core](https://github.com/agent-sh/agent-core), so change shared code there: a local edit is overwritten by the next sync PR.

## Agents

- ci-fixer
- ci-monitor
- exploration-agent
- implementation-agent
- planning-agent
- simple-fixer
- task-discoverer
- worktree-manager

## Skills

- discover-tasks

## Cross-Plugin Agents (from prepare-delivery)

Phases 8-10 use agents from the prepare-delivery plugin:
- `prepare-delivery:delivery-validator` - Phase 10 delivery validation
- `prepare-delivery:test-coverage-checker` - Phase 8 pre-review gate

## Commands

- delivery-approval
- next-task

## Conventions

- Output is plain text with the status markers `[OK]`, `[ERROR]`, `[WARN]`, `[CRITICAL]`, and no emojis or ASCII art. People read it in terminals and other plugins parse it; spend tokens on content, not decoration.
- In prose, write a spaced single dash (` - `), not ` -- ` or an em dash.
- Put summaries, plans and audit notes in the PR or issue, not in committed files: committed notes go stale.
- Changes reach main through a PR. A feature or fix is done when tests that cover it pass.
- Keep git hooks on. `scripts/setup-hooks.sh` installs a pre-push hook that runs `npm test`.
- When a script or tool fails, report the failure before working around it, so the tool gets fixed.
- When goals conflict, rank them: plugin users' experience, automation that needs no babysitting, token cost, output quality, simplicity.

## Dev commands

```bash
npm test                        # node:test suite
agnix --config .agnix.toml .    # agent config lint
```

## References

- Part of the [agentsys](https://github.com/agent-sh/agentsys) ecosystem
- https://agentskills.io
