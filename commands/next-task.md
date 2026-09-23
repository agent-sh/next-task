---
description: Master workflow orchestrator with autonomous task-to-production automation
codex-description: 'Use when user asks to "find next task", "what should I work on", "automate workflow", "implement and ship", "run next-task". Orchestrates complete task-to-production workflow: discovery, implementation, review, and delivery.'
argument-hint: "[filter] [--status] [--resume] [--abort] [--implement] [--base=BRANCH]"
allowed-tools: Bash(git:*), Bash(gh:*), Bash(npm:*), Bash(node:*), Read, Write, Edit, Glob, Grep, Task, Skill, AskUserQuestion
---

# /next-task

Pick the next task worth doing, then take it from an approved plan to the stopping point the user chose (implemented, PR created, merged, or deployed), in an isolated worktree. The user is involved three times: policy, task choice, plan approval. After plan approval the run is autonomous until the stopping point or a blocker that needs the user.

## Arguments

Parse from `$ARGUMENTS`:

- `[filter]`: `bug`, `feature`, `security` or `test`. Pre-selects the priority answer.
- `--status`: print the active workflow (`getFlowSummary()`: task, phase, status, PR) and stop.
- `--resume [task-id|branch|worktree-path]`: continue a workflow from its recorded phase. With no value, resume the only active one, or ask which if there are several. The registry in `<stateDir>/tasks.json` of the main checkout maps task IDs to branches and worktree paths.
- `--abort`: cancel the active workflow (`abortWorkflow(reason)`), release its registry entry, and remove its worktree if it has no uncommitted changes. If it does, leave it and say so.
- `--implement`: after task selection and worktree setup, skip the exploration and planning agents and go to implementation with a short plan you write from the task. Show that plan and get approval first: approval is what authorizes the autonomous phases.
- `--base=BRANCH`: branch to start from and target. Default: the repo default branch (`git symbolic-ref refs/remotes/origin/HEAD`).

A bare `/next-task` never auto-resumes. If the registry has active tasks, ask whether to resume one or start fresh.

## Constraints

- Work happens in a worktree created by `next-task:worktree-manager`, never in the user's checkout. The user may have uncommitted work there, and parallel `/next-task` runs rely on one worktree per task.
- Only `ship:ship` (or, for the "PR created" stopping point, the PR step below) pushes or opens a PR. Agents commit locally. This keeps every push behind the review and validation phases.
- Clean up only this task's worktree, branch, and registry entry. Other worktrees belong to other runs or other agents.
- Issue comments go out only for GitHub sources and only after the user approves the plan. That approval is the consent to comment on the issue for this run.
- Tests that cover the change pass before anything ships. A skipped or weakened test is a blocker, not a pass.

## Harness defaults

- No `AskUserQuestion`: ask the same questions in plain text, numbered options, and wait for the reply. Keep option labels at 30 characters or less either way (OpenCode truncates longer ones), details go in the description.
- No `Task`: run each agent's instructions inline. Agent files live in `${CLAUDE_PLUGIN_ROOT}/agents/`.
- No `Skill`: read the skill or command file and follow it.
- No plan mode (`EnterPlanMode`/`ExitPlanMode`): print the plan and ask for approval in text.
- An agent from another plugin is not installed (`deslop`, `prepare-delivery`, `sync-docs`, `ship`): use the fallback given in its phase and note it in the final report. Nothing here hard-requires another plugin.

## State

`${CLAUDE_PLUGIN_ROOT}/lib/state/workflow-state.js` records progress so `--status`, `--resume` and `--abort` work, and so `/ship` can read the base branch and task. You, the orchestrator, write it at phase boundaries; agents return reports and do not write state. Two files:

- `tasks.json` in the main checkout's state dir: one entry per claimed task (`claimTask`, `releaseTask`).
- `flow.json` in the worktree's state dir: task, policy, git info, current phase, phase results (`createFlow`, `updateFlow`, `startPhase`, `completePhase`, `failPhase`). Pass the worktree path as the last argument once the worktree exists.

Call them from Bash, for example:

```bash
node -e 'const s=require(process.argv[1]); s.startPhase(process.argv[2], process.argv[3])' \
  "${CLAUDE_PLUGIN_ROOT}/lib/state/workflow-state.js" exploration "$WORKTREE"
```

Phase names are fixed by the library: `policy-selection`, `task-discovery`, `worktree-setup`, `exploration`, `planning`, `user-approval`, `implementation`, `pre-review-gates`, `review-loop`, `delivery-validation`, `docs-update`, `shipping`, `complete`.

## Phases

### 1. Policy

Ask the three questions from `getPolicyQuestions()` in `${CLAUDE_PLUGIN_ROOT}/lib/sources/policy-questions.js`, all in one AskUserQuestion call and unchanged: they include the user's cached answers from earlier runs. The questions are task source, priority, and stopping point. For GitHub Projects, ask `getProjectQuestions()` (project number, owner) as a follow-up. Turn the answers into a policy with `parseAndCachePolicy(responses)`, which also caches them. Keep the policy in memory until the worktree exists.

### 2. Task discovery

Spawn `next-task:task-discoverer` with the policy. It returns up to 5 ranked candidates, excluding tasks claimed in the registry and GitHub issues that already have an open PR. Show them with AskUserQuestion (label `#<id>: <title>` cut to 30 characters, score and labels in the description) and let the user pick one. No candidates: say so and suggest a broader priority filter, creating issues, or `/audit-project`.

### 3. Worktree

Spawn `next-task:worktree-manager` with the task ID, title, and base branch. It validates the inputs, creates `../worktrees/<slug>` on `feature/<slug>` from `origin/<base>`, and returns the absolute worktree path and branch. Then claim the task with `claimTask({ id, source, title, branch, worktreePath }, <main checkout>)`, which locks the registry so a parallel run cannot take the same task, and `createFlow(task, policy, <worktree>, <main checkout>)` and record `git.baseBranch`, `git.branch`, `git.worktreePath`, and `git.mainRepoPath`. Every later agent gets the absolute worktree path and works there.

### 4. Exploration

Build the repo-intel context described in `${CLAUDE_PLUGIN_ROOT}/references/repo-intel.md` (skip it if there is no map or the file is missing). Spawn `next-task:exploration-agent` with the task, the worktree path, and that context. It returns an exploration report.

### 5. Planning

Spawn `next-task:planning-agent` with the task, the exploration report, and the same repo-intel context. It returns a JSON plan between `=== PLAN_START ===` and `=== PLAN_END ===`. Store it with `completePhase({ ...plan })`.

### 6. Plan approval

Present the plan with plan mode (or in text) and wait. The user approves, edits, or rejects. On rejection, revise with the planning agent using the feedback, or stop if the user says so. On approval, for GitHub sources, comment on the issue once with the plan summary: overview, files to change, and the architecture decision.

### 7. Implementation

Spawn `next-task:implementation-agent` with the approved plan and the worktree path. It implements, tests, and commits locally, then returns a summary.

### 8. Pre-review gates

Run these in parallel where the harness allows:

- `deslop:deslop-agent` with `Mode: apply`, `Scope: diff`, `Thoroughness: normal`. It returns JSON between `=== DESLOP_RESULT ===` and `=== END_RESULT ===`. If it lists `fixes`, hand them to `next-task:simple-fixer` with the commit message `fix: clean up AI slop`. Not installed: review the diff yourself for debug output, leftover TODOs, and dead code.
- `prepare-delivery:test-coverage-checker` with the `test-gaps` context. Not installed: check that each changed source file has a test that exercises the change.
- The `simplify` skill on the diff. Not available: skip.

### 9. Review loop

Review the diff against the base with the Phase 9 repo-intel context. Size the review to the change:

- Default: one reviewer covering correctness, security, performance, and tests.
- Large or risky diffs (roughly 500+ changed lines, 15+ files, or high diff-risk or security-sensitive paths): up to 4 parallel reviewers, one per concern, optionally swapping one for a specialist the diff calls for (database, API, frontend, infra). Never more than 4 at once.

Use `general-purpose` subagents on a fast tier (sonnet) if `Task` is available, otherwise review inline. Each reviewer returns a JSON array of `{file, line, severity: critical|high|medium|low, description, suggestion}`. Merge duplicates. Fix critical and high findings, and medium ones when the fix is small and clearly right. Commit the fixes, then re-review only what changed.

Stop when no critical or high findings remain (approved), when the same findings come back twice (stalled), or after 3 rounds. A stalled or capped loop with open critical findings is blocked: report them and ask the user whether to continue, fix manually, or stop. Record `completePhase({ approved, iterations, remaining })`.

### 10. Delivery validation

Spawn `prepare-delivery:delivery-validator` to confirm tests, build and requirements. Not installed: follow `${CLAUDE_PLUGIN_ROOT}/commands/delivery-approval.md` inline. If it is not approved, `failPhase(reason, { fixInstructions })`, send the fix instructions back through Phase 7, and repeat 8 to 10. After two failed validations, stop and report.

### 11. Docs

Spawn `sync-docs:sync-docs-agent` with `Mode: apply`, `Scope: before-pr`. It returns JSON between `=== SYNC_DOCS_RESULT ===` and `=== END_RESULT ===`. Hand any `fixes` to `next-task:simple-fixer` with the commit message `docs: sync documentation with code changes`. Not installed: update the README and CHANGELOG yourself if the change is user-visible.

### 12. Stopping point

- `implemented`: stop here and report the worktree and branch.
- `pr-created`: push the branch and open the PR (`gh pr create --base <base>`, body with what changed, why, how it was tested, and `Closes #<id>`). Report the URL and stop.
- `merged`, `deployed`, `production`: invoke `ship:ship` with `--state-file "<worktree>/<stateDir>/flow.json" --base <base>`. `/ship` monitors CI and reviews, merges, deploys on multi-branch repos, closes the issue, and removes this task's worktree. Not installed: do the `pr-created` step and tell the user to merge.

When `/ship` prints `{"ok": true, "nextPhase": "completed", "status": "shipped"}`, call `completeWorkflow(<worktree>)`.

## Errors

On any phase failure, `failPhase(message)` and tell the user what failed, with evidence, and that `--resume` retries from that phase and `--abort` cancels.

## Report

```
## /next-task: #<id> <title>
Stopping point: <policy> | Reached: <phase>
Worktree: <path> (<branch>, or "removed by /ship")
Plan: <n> steps | Commits: <n>
Review: <iterations> rounds, <fixed> fixed, <open> open
Validation: tests <pass|fail>, build <pass|fail|none>
PR: <url or "not created"> | Merged: <sha or "no">
Skipped or substituted: <gates that fell back, and why>
```
