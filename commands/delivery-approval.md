---
description: Validate task completion and approve for shipping. Can be used standalone or called by the workflow. Runs autonomous validation checks.
codex-description: 'Use when user asks to "validate delivery", "approve for shipping", "check if ready to ship", "verify task completion". Autonomous validation that tests pass, build succeeds, and requirements are met.'
argument-hint: "[--task-id ID] [--verbose]"
allowed-tools: Bash(git:*), Bash(npm:*), Read, Grep, Glob
model: sonnet
---

# /delivery-approval

Decide whether the current branch is ready to ship: committed, green, and doing what the task asked. This runs the same checks as `prepare-delivery:delivery-validator` and is the fallback `/next-task` uses when that plugin is not installed.

## Arguments

From `$ARGUMENTS`:

- `--task-id ID`: the task to check requirements against. Default: the task in the workflow state (`readFlow()` in `${CLAUDE_PLUGIN_ROOT}/lib/state/workflow-state.js`), then an issue referenced in recent commit messages, then none.
- `--verbose`: include the relevant output of each check, not just pass or fail.

The base branch is `git.baseBranch` from the workflow state, else the repo default.

## Checks

| Check | Passes when |
|---|---|
| Git state | No uncommitted changes, and at least one commit ahead of `origin/<base>` |
| Tests | The project's test command exits 0 (`npm test`, `pytest`, `cargo test`, `go test ./...`, or whatever the repo documents) |
| Build | The build command exits 0, or the project has none |
| Lint | The lint command exits 0, or the project has none |
| Types | `tsc --noEmit` exits 0 when there is a `tsconfig.json`, or the project has no type check |
| Requirements | Each concrete requirement in the task description has evidence in the diff (`git diff origin/<base>...HEAD`) or a test. No task: skipped, and the report says so |

Detect commands from the repo (package scripts, Makefile, CI workflow) rather than guessing. A check with no command is `n/a`, not a pass or a fail. Requirements is a judgment: quote the requirement and point at the file and line that meets it.

## Output

```markdown
## Delivery Validation

Task: <title or N/A> | Branch: <branch> | Ahead of <base>: <n> commits

| Check | Status | Details |
|---|---|---|
| Git state | [OK] or [FAIL] | ... |
| Tests | [OK], [FAIL] or n/a | exit code, failing tests |
| Build | ... | ... |
| Lint | ... | ... |
| Types | ... | ... |
| Requirements | ... | met / missing, with evidence |

[OK] APPROVED  or  [FAIL] NOT APPROVED: <failed checks>

### Fix required
- <one line per failed check>
```

Then the machine-readable result, which `/next-task` reads:

```json
{
  "approved": true,
  "task": { "id": "142", "title": "..." },
  "checks": { "gitState": {}, "tests": {}, "build": {}, "lint": {}, "typeCheck": {}, "requirements": {} },
  "failedChecks": [],
  "fixInstructions": [],
  "summary": "All checks passed"
}
```

Each entry in `checks` has `passed` (true, false, or null for n/a) and the details you reported. Standalone runs report only. They do not change workflow state.
