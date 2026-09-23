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
## Workflow Enforcement: /next-task

A subagent finished inside an active /next-task workflow.

Current phase: ${flow.phase || 'Unknown'}
Current status: ${flow.status}
Task: ${flow.task?.title || 'Unknown'}

<next-phase>
Continue with the phase after the one that just finished, in this order:

worktree-setup -> exploration -> planning -> user-approval -> implementation
-> pre-review-gates -> review-loop -> delivery-validation -> docs-update -> shipping

- worktree-manager done: run exploration in the returned worktree path.
- implementation-agent done: run the pre-review gates (deslop, test coverage, simplify).
- Pre-review gates done: run the review loop, then delivery validation.
- Delivery validation not approved: send its fix instructions back through implementation.
- Docs update done: go to the policy's stopping point (stop, open a PR, or run ship:ship).
</next-phase>

<gates>
Each gate protects the step after it. The worktree keeps the user's checkout untouched,
the review loop and delivery validation are what make a push safe, and /ship handles
CI and reviewer feedback after the PR exists. If a gate cannot run (plugin missing,
tool unavailable), use the fallback in commands/next-task.md and record it for the
final report instead of skipping silently.
</gates>

Return: {"ok": true, "nextPhase": "<phase-name>", "verified": ["<gate-name>"]}
</subagent-stop-hook>`;
}

main();
