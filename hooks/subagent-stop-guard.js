/**
 * SubagentStop hook guard - only injects workflow enforcement when a
 * /next-task workflow is actively running.
 *
 * Outputs the enforcement prompt to stderr when flow.json exists with
 * status 'in_progress'. Exits silently otherwise (no-op).
 *
 * Cross-platform: uses Node.js instead of bash so it works on Windows,
 * macOS, and Linux equally.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Reuse the platform-aware state directory detection
const { getStateDirPath } = require('../lib/platform/state-dir');

const FLOW_FILE = 'flow.json';

function main() {
  const flowPath = path.join(getStateDirPath(), FLOW_FILE);

  // No flow.json = no active workflow = no-op
  if (!fs.existsSync(flowPath)) {
    process.exit(0);
  }

  let flow;
  try {
    flow = JSON.parse(fs.readFileSync(flowPath, 'utf8'));
  } catch {
    // Corrupted or unreadable - don't inject, let workflow-state handle it
    process.exit(0);
  }

  // Only inject when workflow is actively running
  if (!flow || flow.status !== 'in_progress' || flow.phase === 'complete') {
    process.exit(0);
  }

  // Active workflow - output the enforcement prompt to stderr
  const prompt = buildEnforcementPrompt(flow);
  process.stderr.write(prompt);
}

function buildEnforcementPrompt(flow) {
  return `<subagent-stop-hook>
## Workflow Enforcement - SubagentStop Hook

A subagent has completed. Determine and execute the next workflow phase.

Current phase: ${flow.phase || 'Unknown'}
Current status: ${flow.status}
Task: ${flow.task?.title || 'Unknown'}

<verification-gates>
### Verification Gates

Before proceeding to any next phase, verify the required previous steps completed.

---

## Gate 0: Before Task Discovery (Phase 2)

**Required**: Policy decisions must be cached in preference file.

**Forbidden**:
- Proceeding to task-discoverer without user policy decisions
- Skipping the AskUserQuestion step in Phase 1

---

## Gate 1: Before Exploration (Phase 4)

**Required**: Worktree must have been created via \`next-task:worktree-manager\` agent.

**Forbidden**:
- Using \`git checkout -b\` directly
- Using \`git branch\` directly
- Proceeding to exploration without worktree verification

---

## Gate 2: Before Delivery Validation (Phase 10)

**Required**: Review loop must have run with proper iterations.

**Forbidden**:
- Skipping to delivery without running review loop
- Running review with 0 iterations

---

## Gate 3: Before ship:ship Merge

**Required**: All PR comments must be addressed.

Enforced in ship:ship command:
1. Phase 4 CI & Review Monitor Loop must run
2. 3-minute wait for auto-reviewers must complete
3. All comments must be addressed before merge
</verification-gates>

---

<decision-tree>
### Decision Tree

1. **worktree-manager completed**: Verify worktree path, then run exploration-agent
2. **implementation-agent completed**: Run deslop:deslop-agent + prepare-delivery:test-coverage-checker + /simplify (parallel)
3. **pre-review gates completed**: Run review loop (min 1 iteration), then prepare-delivery:delivery-validator
4. **prepare-delivery:delivery-validator completed**: If approved, run sync-docs:sync-docs-agent. If not, return to implementation.
5. **sync-docs:sync-docs-agent completed**: Invoke ship:ship command
</decision-tree>

---

<enforcement>
### Enforcement

Every step exists for a reason. Taking shortcuts defeats the purpose of automation.

- Do not skip worktree-manager (enables parallel task isolation)
- Do not skip review iterations (catches bugs humans miss)
- Do not skip 3-minute wait in ship:ship (auto-reviewers need time)
- Do not skip addressing PR comments (blocks merge)

If you think a step is unnecessary, you are wrong.
</enforcement>

---

<workflow-sequence>
### Workflow Sequence

0. [GATE] policy-cached (preference file must exist)
1. task-discoverer
2. [GATE] worktree-manager (must use agent)
3. [VERIFY] worktree exists
4. exploration-agent
5. planning-agent
6. implementation-agent
7. pre-review gates (deslop + prepare-delivery:test-coverage-checker + /simplify)
8. review loop (1+ iterations)
9. [GATE] prepare-delivery:delivery-validator
10. sync-docs:sync-docs-agent
11. ship:ship command (must run Phase 4 loop)
</workflow-sequence>

Return: {"ok": true, "nextPhase": "<phase-name>", "verified": ["<gate-name>"]}
</subagent-stop-hook>`;
}

main();
