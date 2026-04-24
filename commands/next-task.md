---
description: Master workflow orchestrator with autonomous task-to-production automation
codex-description: 'Use when user asks to "find next task", "what should I work on", "automate workflow", "implement and ship", "run next-task". Orchestrates complete task-to-production workflow: discovery, implementation, review, and delivery.'
argument-hint: "[filter] [--status] [--resume] [--abort] [--implement] [--base=BRANCH]"
allowed-tools: Bash(git:*), Bash(gh:*), Bash(npm:*), Bash(node:*), Read, Write, Edit, Glob, Grep, Task, Skill, AskUserQuestion
---

# /next-task - Master Workflow Orchestrator

Discover what to work on next and execute the complete implementation workflow.

---

<no-shortcuts-policy>
## No Shortcuts Policy

This workflow exists because each step serves a purpose. Taking shortcuts defeats the purpose of automation.

| Step | Purpose | What Happens If Skipped |
|------|---------|------------------------|
| Worktree creation | Parallel task isolation | Conflicts, lost work |
| Review loop (5 iterations, stall-safe) | Catches bugs humans miss | Bugs ship to production |
| 3-minute CI wait | Auto-reviewers need time | Miss critical feedback |
| Address all PR comments | Quality gate | Merge blocked, trust lost |

### Enforcement Rules

1. Every step is mandatory - not suggestions, not guidelines, requirements
2. Use the specified agents - do not substitute with manual commands
3. Output verification blocks - prove each step completed
4. If you think a step is unnecessary, review the "What Happens If Skipped" column above

### Forbidden Shortcuts

- `git checkout -b` or `git branch` instead of `worktree-manager` agent
- Single CI check instead of monitoring loop
- Rationalizing skips ("it's faster", "not needed this time")
</no-shortcuts-policy>

---

## Workflow Overview

**Phases 1-6 (User Interaction):**
1. Policy Selection
2. Task Discovery
3. Worktree Setup
4. Exploration
5. Planning
6. User Approval

**Phases 7-12 (Autonomous):**
7. Implementation
8. Pre-Review Gates
9. Review Loop
10. Delivery Validation
11. Docs Update
12. `ship:ship`

**Human interaction points (ONLY THESE):**
1. Policy selection via checkboxes
2. Task selection from ranked list
3. Plan approval (EnterPlanMode/ExitPlanMode)

<workflow-gates>
## Workflow Gates

Each phase must complete before the next starts:

| Gate | Requirement |
|------|-------------|
| Implementation | Agent completes all plan steps |
| Pre-Review | deslop:deslop-agent + prepare-delivery:test-coverage-checker + /simplify (parallel) |
| Review Loop | Must approve (no open issues or override) |
| Delivery | Tests pass, build passes |
| Docs | Documentation updated |
| Ship | Explicit `ship:ship` invocation (plugin command) |

**Forbidden actions for agents:**
- No agent may create PRs or push to remote (only ship:ship)
- No agent may skip Phase 9, prepare-delivery:delivery-validator, or docs update
</workflow-gates>

## Arguments

Parse from $ARGUMENTS:
- `--status`: Show current workflow state and exit
- `--resume [task/branch/worktree]`: Continue from last checkpoint
- `--abort`: Cancel workflow and cleanup
- `--implement`: Skip to implementation after task selection
- `[filter]`: Task filter (bug, feature, security, test)

### Resume Syntax

```
/next-task --resume                     # Resume active worktree (if only one)
/next-task --resume 123                 # Resume by task ID
/next-task --resume feature/my-task-123 # Resume by branch name
/next-task --resume ../worktrees/my-task-123  # Resume by worktree path
```

## Default Behavior (No Arguments)

1. Goes to Phase 1: Policy Selection
2. Policy selector checks for existing tasks in `{stateDir}/tasks.json`
3. If existing tasks found, **ASKS USER** what to do
4. Then continues with normal policy configuration

The workflow never auto-resumes. It always asks first.

<opencode-constraint>
## OpenCode Label Limit

All AskUserQuestion option labels must be ≤30 characters. Put details in `description`, not `label`.
</opencode-constraint>

## State Management

Uses `lib/state/workflow-state.js` for all state operations:

| File | Location | Purpose |
|------|----------|---------|
| `tasks.json` | Main repo `{stateDir}/` | Active task registry |
| `flow.json` | Worktree `{stateDir}/` | Workflow progress |

Key functions:
- `workflowState.startPhase(phase)` - Begin a phase
- `workflowState.completePhase(result)` - Complete and advance
- `workflowState.updateFlow(updates)` - Partial state updates
- `workflowState.hasActiveTask()` - Check for existing work
- `workflowState.canResume()` - Check if resumable

## Pre-flight: Handle Arguments

```javascript
const { getPluginRoot } = require('./lib/cross-platform');
const path = require('path');
const pluginRoot = getPluginRoot('next-task');
const workflowState = require(path.join(pluginRoot, 'lib/state/workflow-state.js'));
const args = '$ARGUMENTS'.split(' ').filter(Boolean);

// --base=BRANCH: override the base branch for this project
const baseArg = args.find(a => a.startsWith('--base='));
let BASE_BRANCH = 'main';
if (baseArg) {
  BASE_BRANCH = baseArg.split('=')[1];
} else {
  // Detect repo default branch
  const ref = await run('git', ['symbolic-ref', 'refs/remotes/origin/HEAD']).catch(() => '');
  BASE_BRANCH = ref.trim().replace('refs/remotes/origin/', '') || 'main';
}

// No flags → Phase 1 (Policy Selection asks about existing tasks)
if (args.length === 0) {
  console.log("Starting Phase 1 (Policy Selection)");
}

// Handle --status, --abort, --resume via workflowState functions
if (args.includes('--status')) {
  const summary = workflowState.getFlowSummary();
  console.log(summary ? `Phase: ${summary.phase} | Task: ${summary.task}` : "No active workflow.");
  return;
}

if (args.includes('--abort')) {
  workflowState.abortWorkflow('User requested abort');
  return;
}

if (args.includes('--resume')) {
  // Use lib functions to find worktree and resume from last phase
  const flow = workflowState.readFlow();
  if (flow && workflowState.canResume()) {
    console.log(`Resuming from phase: ${flow.phase}`);
  }
}
```

<phase-1>
## Phase 1: Policy Selection

No agent needed. Use AskUserQuestion tool with ALL 3 questions from `lib/sources/policy-questions.js`.

**MANDATORY - Ask ALL 3 Questions:**

| # | Header | Question | Options |
|---|--------|----------|---------|
| 1 | Source | Where should I look for tasks? | GitHub Issues, GitHub Projects, GitLab Issues, Local tasks.md, Custom, Other (+ cached if exists) |
| 2 | Priority | What type of tasks to prioritize? | All, Bugs, Security, Features, Other (+ cached free-text) |
| 3 | Stop Point | How far should I take this task? | Merged, PR Created, Implemented, Deployed, Production, Other (+ cached free-text) |

**Free-text caching**: When the user selects "Other" and types a custom response (e.g., "merged to feature/v2"), that response is cached and offered as a named option in subsequent runs. If the user stops selecting it for 3 consecutive runs, it is automatically removed.

**Forbidden Actions:**
- Skipping any of the 3 questions
- Inventing your own questions instead of using the exact ones above
- Proceeding to Phase 2 without all 3 answers

```javascript
// Reference implementation - use ALL questions
const { sources } = require(path.join(pluginRoot, 'lib'));
const { questions, cachedPreference } = sources.getPolicyQuestions();
// questions array contains all 3 questions above
AskUserQuestion({ questions }); // Pass all 3 questions

// Handle GitHub Projects follow-up
if (sources.needsProjectFollowUp(responses.source)) {
  const projectQs = sources.getProjectQuestions();
  const projectResponses = await AskUserQuestion(projectQs);
  responses.project = {
    number: projectResponses['Project Number'],
    owner: projectResponses['Project Owner']
  };
}

const policy = sources.parseAndCachePolicy(responses);
workflowState.updateFlow({ policy, baseBranch: BASE_BRANCH, phase: 'task-discovery' });

// Gate: verify preference was cached
const cached = sources.getPreference?.() || sourceCache.getPreference();
if (!cached) {
  console.error('[BLOCKED] Policy decision was not persisted to preference cache.');
  console.error('This is a bug - parseAndCachePolicy should have written the file.');
  throw new Error('preference-not-cached');
}
console.log(`[VERIFIED] Policy cached: source=${cached.source}`);
```
</phase-1>

<phase-2>
## Phase 2: Task Discovery

**Agent**: `next-task:task-discoverer` (sonnet)

```javascript
workflowState.startPhase('task-discovery');
await Task({
  subagent_type: "next-task:task-discoverer",
  prompt: `Discover tasks from source: ${JSON.stringify(policy.taskSource)}. Filter: ${policy.priorityFilter}. Present top 5 for selection.`
});
```
</phase-2>

<phase-3>
## Phase 3: Worktree Setup

**Blocking gate** - Cannot proceed to Phase 4 without completing this.

Spawn: `next-task:worktree-manager` (haiku)

```javascript
workflowState.startPhase('worktree-setup');

// Required - use this agent, not manual git commands
const worktreeResult = await Task({
  subagent_type: "next-task:worktree-manager",
  prompt: `Create worktree for task #${state.task.id}. Anchor pwd to worktree.`
});

// Verification - mandatory before proceeding
if (!worktreeResult.worktreePath) {
  throw new Error('[BLOCKED] Worktree creation failed - STOP');
}
console.log(`[VERIFIED] Worktree: ${worktreeResult.worktreePath}`);
```

### Forbidden Actions for Phase 3
- `git checkout -b <branch>` (use worktree-manager agent)
- `git branch <branch>` (use worktree-manager agent)
- Proceeding to Phase 4 without worktree verification output
- Skipping worktree "because branching is faster"
</phase-3>

<phase-4>
## Phase 4: Exploration

**Agent**: `next-task:exploration-agent` (opus)

```javascript
workflowState.startPhase('exploration');

// Pre-fetch repo-intel for Phase 4
let explorationIntelContext = '';
try {
  const { binary } = require('@agentsys/lib');
  const { getStateDirPath } = require('@agentsys/lib/platform/state-dir');
  const fs = require('fs');
  const cwd = process.cwd();
  const path = require('path');
  const mapFile = path.join(getStateDirPath(cwd), 'repo-intel.json');
  const q = (args) => { try { return JSON.parse(binary.runAnalyzer(args)); } catch (e) { console.warn(`[WARN] repo-intel query failed (${args[3]}): ${e.message}`); return null; } };

  if (fs.existsSync(mapFile)) {
    const intel = {};
    intel.hotspots = q(['repo-intel', 'query', 'hotspots', '--top', '15', '--map-file', mapFile, cwd]);
    intel.bugspots = q(['repo-intel', 'query', 'bugspots', '--top', '10', '--map-file', mapFile, cwd]);
    intel.busFactor = q(['repo-intel', 'query', 'bus-factor', '--map-file', mapFile, cwd]);
    intel.conventions = q(['repo-intel', 'query', 'conventions', '--map-file', mapFile, cwd]);

    const parts = [];
    if (intel.hotspots?.length) parts.push(`Hotspots (most volatile files):\n${JSON.stringify(intel.hotspots, null, 2)}`);
    if (intel.bugspots?.length) parts.push(`Bugspots (highest bug-fix density):\n${JSON.stringify(intel.bugspots, null, 2)}`);
    if (intel.busFactor) parts.push(`Bus factor:\n${JSON.stringify(intel.busFactor, null, 2)}`);
    if (intel.conventions) parts.push(`Conventions (match this style):\n${JSON.stringify(intel.conventions, null, 2)}`);

    if (parts.length > 0) {
      explorationIntelContext = '\n\nRepo intel context (use to prioritize risky files and match coding style):\n' + parts.join('\n\n');
    }
  }
} catch (e) { /* repo-intel unavailable */ }

await Task({
  subagent_type: "next-task:exploration-agent",
  model: "opus",
  prompt: `Deep codebase analysis for task #${state.task.id}. Find key files, patterns, dependencies.${explorationIntelContext}`
});
```
</phase-4>

<phase-5>
## Phase 5: Planning

**Agent**: `next-task:planning-agent` (opus)

```javascript
workflowState.startPhase('planning');
const planOutput = await Task({
  subagent_type: "next-task:planning-agent",
  model: "opus",
  prompt: `Design implementation plan for task #${state.task.id}. Output structured JSON between === PLAN_START === and === PLAN_END === markers.`
});
```
</phase-5>

<phase-6>
## Phase 6: User Approval (Plan Mode)

**Last human interaction point.** Present plan via EnterPlanMode/ExitPlanMode.

```javascript
EnterPlanMode();
// User reviews and approves via ExitPlanMode
workflowState.completePhase({ planApproved: true, plan });
```
</phase-6>

<phase-7>
## Phase 7: Implementation

**Agent**: `next-task:implementation-agent` (opus)

```javascript
workflowState.startPhase('implementation');
await Task({
  subagent_type: "next-task:implementation-agent",
  model: "opus",
  prompt: `Execute approved plan for task #${state.task.id}. Commit changes incrementally.`
});
// → SubagentStop hook triggers pre-review gates
```
</phase-7>

<phase-8>
## Phase 8: Pre-Review Gates

**Parallel**: `deslop:deslop-agent` (Task) + `prepare-delivery:test-coverage-checker` (Task) + `/simplify` (Skill, orchestrator)

```javascript
workflowState.startPhase('pre-review-gates');

// Pre-fetch repo-intel for Phase 8
let testGapsContext = '';
try {
  const { binary } = require('@agentsys/lib');
  const { getStateDirPath } = require('@agentsys/lib/platform/state-dir');
  const fs = require('fs');
  const path = require('path');
  const cwd = process.cwd();
  const mapFile = path.join(getStateDirPath(cwd), 'repo-intel.json');

  if (fs.existsSync(mapFile)) {
    try {
      const testGaps = JSON.parse(binary.runAnalyzer([
        'repo-intel', 'query', 'test-gaps', '--top', '20', '--map-file', mapFile, cwd
      ]));
      if (testGaps?.length) {
        testGapsContext = '\n\nRepo intel test-gaps (hot files with no co-changing test file):\n' + JSON.stringify(testGaps, null, 2);
      }
    } catch (e) { /* unavailable */ }
  }
} catch (e) { /* repo-intel unavailable */ }

// Helper to parse deslop structured output
function parseDeslop(output) {
  const match = output.match(/=== DESLOP_RESULT ===[\s\S]*?({[\s\S]*?})[\s\S]*?=== END_RESULT ===/);
  return match ? JSON.parse(match[1]) : { fixes: [] };
}

// Run all three gates in parallel
const [deslopResult, coverageResult] = await Promise.all([
  Task({
    subagent_type: "deslop:deslop-agent",
    prompt: `Scan for AI slop patterns.
Mode: apply
Scope: diff
Thoroughness: normal

Return structured results between === DESLOP_RESULT === markers.`
  }),
  Task({ subagent_type: "prepare-delivery:test-coverage-checker", prompt: `Validate test coverage.${testGapsContext}` }),
  Skill({ name: "simplify" })
]);

// If deslop fixes found, spawn simple-fixer
const deslop = parseDeslop(deslopResult);
if (deslop.fixes && deslop.fixes.length > 0) {
  await Task({
    subagent_type: "next-task:simple-fixer",
    model: "haiku",
    prompt: `Apply these slop fixes:
${JSON.stringify(deslop.fixes, null, 2)}

For each fix:
- remove-line: Delete the line at the specified line number
- add-comment: Add "// Error intentionally ignored" to empty catch

Use Edit tool to apply. Commit message: "fix: clean up AI slop"`
  });
}

const gatesPassed = (deslop.fixes?.length || 0) === 0;
workflowState.completePhase({
  passed: gatesPassed,
  deslopFixes: deslop.fixes?.length || 0,
  coverageResult
});
```
</phase-8>

<phase-9>
## Phase 9: Review Loop

**Blocking gate** - Must run iterations before delivery validation.

```javascript
workflowState.startPhase('review-loop');

// Pre-fetch repo-intel for Phase 9. Four analyzer signals so the
// reviewer agents don't have to re-derive them from file reads:
//
//   diff-risk    → existing: highest-risk changed files
//   slop-fixes   → concrete mechanical findings on changed files
//                  (empty catches, tautological tests, passthrough
//                  wrappers, always-true conditions, commented-out
//                  code, orphan exports, etc)
//   entry-points → execution surfaces in the diff so reviewers don't
//                  flag `main`/Cargo bins as "missing docs"
//   slop-targets → cross-file signals (wrapper towers, single-impl
//                  traits, cliche clusters) that no per-file pass
//                  would catch
//
// All degrade gracefully: missing binary / missing map → empty
// context, no review regression.
let diffRiskContext = '';
let slopContext = '';
try {
  const { binary } = require('@agentsys/lib');
  const fs = require('fs');
  const path = require('path');
  const cp = require('child_process');
  const { getStateDirPath } = require('@agentsys/lib/platform/state-dir');
  const cwd = process.cwd();
  const mapFile = path.join(getStateDirPath(cwd), 'repo-intel.json');

  if (fs.existsSync(mapFile)) {
    const changedFiles = cp.execFileSync('git', ['diff', '--name-only', `${BASE_BRANCH}...HEAD`], {
      encoding: 'utf8', cwd
    }).trim().split('\n').filter(Boolean);

    if (changedFiles.length > 0) {
      const changedSet = new Set(changedFiles.map(f => f.replace(/\\/g, '/')));

      try {
        const diffRisk = JSON.parse(binary.runAnalyzer([
          'repo-intel', 'query', 'diff-risk',
          '--files', changedFiles.join(','),
          '--map-file', mapFile, cwd
        ]));
        if (diffRisk) {
          diffRiskContext = '\n\nRepo intel diff-risk for changed files (use to focus review on highest-risk files):\n' + JSON.stringify(diffRisk, null, 2);
        }
      } catch (e) { /* unavailable */ }

      // Slop-fixes: filter to just the changed files so reviewers
      // don't get distracted by slop in unrelated areas. Highest-
      // confidence findings first; cap at 30 to keep the prompt
      // bounded on large diffs.
      try {
        const slopRaw = JSON.parse(binary.runAnalyzer([
          'repo-intel', 'query', 'slop-fixes',
          '--map-file', mapFile, cwd
        ]));
        const allFixes = Array.isArray(slopRaw) ? slopRaw : (slopRaw?.fixes || []);
        const changedFixes = allFixes.filter(f => {
          const p = (f.action?.path || '').replace(/\\/g, '/');
          return changedSet.has(p);
        });
        if (changedFixes.length > 0) {
          changedFixes.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
          slopContext += '\n\nPre-computed slop findings on the changed files (use these directly - do not re-scan):\n' + JSON.stringify(changedFixes.slice(0, 30), null, 2);
        }
      } catch (e) { /* unavailable */ }

      // Entry-points touching changed files — reviewers use this to
      // avoid flagging execution surfaces as "missing prose docs".
      try {
        const entryPoints = JSON.parse(binary.runAnalyzer([
          'repo-intel', 'query', 'entry-points',
          '--map-file', mapFile, cwd
        ]));
        if (Array.isArray(entryPoints) && entryPoints.length > 0) {
          const changedEps = entryPoints.filter(ep => changedSet.has((ep.path || '').replace(/\\/g, '/')));
          if (changedEps.length > 0) {
            slopContext += '\n\nEntry points in changed files (execution surfaces - do not flag as missing docs):\n' + JSON.stringify(changedEps, null, 2);
          }
        }
      } catch (e) { /* unavailable */ }

      // Slop-targets: cross-file clusters that intersect the diff.
      // Cap at 15 after intersection.
      try {
        const targetsRaw = JSON.parse(binary.runAnalyzer([
          'repo-intel', 'query', 'slop-targets',
          '--limit', '50',
          '--map-file', mapFile, cwd
        ]));
        const targets = Array.isArray(targetsRaw) ? targetsRaw : (targetsRaw?.targets || []);
        const touching = targets.filter(t => {
          const p = (t.path || t.file || '').replace(/\\/g, '/');
          return changedSet.has(p);
        }).slice(0, 15);
        if (touching.length > 0) {
          slopContext += '\n\nSlop targets touching the changed files (cross-file signals - wrapper towers, single-impl traits, cliche clusters):\n' + JSON.stringify(touching, null, 2);
        }
      } catch (e) { /* unavailable */ }
    }
  }
} catch (e) { /* repo-intel unavailable */ }
```

**CRITICAL**: You MUST spawn multiple parallel reviewer agents. Do NOT use a single generic reviewer.

### Step 1: Get Changed Files

```bash
git diff --name-only ${BASE_BRANCH}...HEAD
```

### Step 2: Detect Signals for Conditional Specialists

Based on changed files, detect which additional specialists are needed:

| Signal | Pattern | Specialist |
|--------|---------|------------|
| hasDb | `/(db\|migrations?\|schema\|prisma\|sql)/i` | database specialist |
| hasApi | `/(api\|routes?\|controllers?\|handlers?)/i` | api designer |
| hasFrontend | `/\.(tsx\|jsx\|vue\|svelte)$/` | frontend specialist |
| hasBackend | `/(server\|backend\|services?\|domain)/i` | backend specialist |
| hasDevops | `/(\.github\/workflows\|Dockerfile\|k8s\|terraform)/i` | devops reviewer |
| needsArchitecture | 20+ changed files | architecture reviewer |

### Step 3: Spawn ALL Reviewer Agents in Parallel

**MANDATORY**: Spawn these 4 core reviewers (ALWAYS) + any conditional specialists detected above.

```javascript
// 4 CORE REVIEWERS - ALWAYS SPAWN ALL 4 IN PARALLEL
const coreReviewers = [
  { role: 'code quality reviewer', focus: 'Style, best practices, bugs, error handling, duplication' },
  { role: 'security reviewer', focus: 'Auth flaws, input validation, injection, secrets exposure' },
  { role: 'performance reviewer', focus: 'N+1 queries, blocking ops, hot path issues, memory leaks' },
  { role: 'test coverage reviewer', focus: 'Missing tests, edge cases, test quality, mock appropriateness' }
];

// Spawn ALL 4 core reviewers in parallel using Task tool
const reviewResults = await Promise.all([
  Task({ subagent_type: 'general-purpose', model: 'sonnet',
    prompt: `You are a code quality reviewer. Review these files: ${files.join(', ')}
Focus: Style and consistency, Best practices, Bugs and logic errors, Error handling, Maintainability, Duplication
Return findings as JSON array with: file, line, severity (critical/high/medium/low), description, suggestion${diffRiskContext}${slopContext}` }),
  Task({ subagent_type: 'general-purpose', model: 'sonnet',
    prompt: `You are a security reviewer. Review these files: ${files.join(', ')}
Focus: Auth/authz flaws, Input validation, Injection risks, Secrets exposure, Insecure defaults
Return findings as JSON array with: file, line, severity (critical/high/medium/low), description, suggestion${diffRiskContext}${slopContext}` }),
  Task({ subagent_type: 'general-purpose', model: 'sonnet',
    prompt: `You are a performance reviewer. Review these files: ${files.join(', ')}
Focus: N+1 queries, Blocking operations, Hot path inefficiencies, Memory leaks
Return findings as JSON array with: file, line, severity (critical/high/medium/low), description, suggestion${diffRiskContext}${slopContext}` }),
  Task({ subagent_type: 'general-purpose', model: 'sonnet',
    prompt: `You are a test coverage reviewer. Review these files: ${files.join(', ')}
Focus: Missing tests, Edge case coverage, Test quality, Integration needs, Mock appropriateness
Return findings as JSON array with: file, line, severity (critical/high/medium/low), description, suggestion${diffRiskContext}${slopContext}` })
]);

// Add conditional specialists based on signals (spawn in parallel with appropriate prompts)
```

### Step 4: Aggregate Findings

Combine all reviewer findings, deduplicate by file+line+description, group by severity.

### Step 5: Fix Issues (severity order: critical -> high -> medium -> low)

For each finding, use Edit tool to apply the suggested fix. Commit after each batch.

### Step 6: Iterate Until Clean (max 5 iterations)

Repeat steps 3-5 until:
- `openCount === 0` (all issues resolved) -> approved
- Same findings hash for 2 consecutive iterations (stall detected) -> blocked
- 5 iterations reached (hard limit) -> blocked

### Review Iteration Rules
- MUST run at least 1 full iteration with ALL 4 core reviewers
- Do NOT use a single generic reviewer - spawn all specialists in parallel
- MUST continue while `openCount > 0`. Only stop on: openCount===0, stall detection, or 5-iteration hard limit
- Do not skip directly to delivery validation
- Do not claim "review passed" without spawning the reviewer agents

### Verification Output (MANDATORY)

After review loop completes, output:
```
[VERIFIED] Review Loop Complete
- Iterations: N
- Core reviewers spawned: code-quality, security, performance, test-coverage
- Conditional specialists: [list any that were added]
- Findings resolved: X critical, Y high, Z medium
- Status: approved | blocked
```

Then advance the workflow state:
```javascript
workflowState.completePhase({ approved, iterations, remaining });
```
</phase-9>

<phase-10>
## Phase 10: Delivery Validation

**Agent**: `prepare-delivery:delivery-validator` (sonnet)

```javascript
workflowState.startPhase('delivery-validation');
const result = await Task({
  subagent_type: "prepare-delivery:delivery-validator",
  prompt: `Validate completion. Check: tests pass, build passes, requirements met.`
});
if (!result.approved) {
  workflowState.failPhase(result.reason, { fixInstructions: result.fixInstructions });
  return; // Retries from implementation
}
```
</phase-10>

<phase-11>
## Phase 11: Docs Update

**Agent**: `sync-docs:sync-docs-agent` (sonnet)

Uses the unified sync-docs agent from the sync-docs plugin with `before-pr` scope.

```javascript
workflowState.startPhase('docs-update');

// Helper to parse sync-docs structured output
function parseSyncDocsResult(output) {
  const match = output.match(/=== SYNC_DOCS_RESULT ===[\s\S]*?({[\s\S]*?})[\s\S]*?=== END_RESULT ===/);
  return match ? JSON.parse(match[1]) : { issues: [], fixes: [], changelog: { status: 'ok' } };
}

// Run sync-docs with before-pr scope
const syncResult = await Task({
  subagent_type: "sync-docs:sync-docs-agent",
  prompt: `Sync documentation with code state.
Mode: apply
Scope: before-pr

Execute the sync-docs skill and return structured results.`
});

// Parse results from === SYNC_DOCS_RESULT === markers
const result = parseSyncDocsResult(syncResult);

// If fixes are needed, spawn simple-fixer
if (result.fixes && result.fixes.length > 0) {
  await Task({
    subagent_type: "next-task:simple-fixer",
    model: "haiku",
    prompt: `Apply these documentation fixes:
${JSON.stringify(result.fixes, null, 2)}

Use the Edit tool to apply each fix. Commit message: "docs: sync documentation with code changes"`
  });
}

workflowState.completePhase({ docsUpdated: true, fixesApplied: result.fixes?.length || 0 });
```
</phase-11>

<phase-12>
## Phase 12: Handoff to ship:ship

After docs update (sync-docs-agent) completes, invoke `ship:ship` explicitly:

```javascript
workflowState.startPhase('shipping');
console.log(`Task #${state.task.id} passed all validation. Invoking ship:ship...`);
const stateDir = workflowState.getStateDir(); // Returns platform-aware state directory
const baseBranch = state?.git?.baseBranch;
const baseArg = baseBranch ? ` --base ${baseBranch}` : '';
await Skill({ name: "ship:ship", args: `--state-file "${stateDir}/flow.json"${baseArg}` });
```

**ship:ship responsibilities:**
- Create PR, push branch
- Monitor CI and review comments
- Merge when approved
- Cleanup worktree and tasks.json
</phase-12>

## Error Handling

```javascript
try {
  // ... workflow phases ...
} catch (error) {
  workflowState.failPhase(error.message);
  console.log(`Workflow failed. Use --resume to retry or --abort to cancel.`);
}
```

## Success Criteria

- Policy selection via checkboxes
- Two-file state management (tasks.json + flow.json)
- Resume by task ID, branch, or worktree path
- Worktree isolation for parallel workflows
- Opus for complex tasks (explore, plan, implement)
- Sonnet for validation tasks (review, delivery)
- Haiku for simple tasks (worktree)
- Fully autonomous after plan approval
- Explicit ship:ship handoff for PR workflow

Begin workflow now.
