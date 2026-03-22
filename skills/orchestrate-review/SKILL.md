---
name: orchestrate-review
version: 5.1.0
description: "Use when user asks to \"deep review the code\", \"thorough code review\", \"multi-pass review\", or when orchestrating the Phase 9 review loop. Provides review pass definitions (code quality, security, performance, test coverage), signal detection patterns, and iteration algorithms."
metadata:
  short-description: "Multi-pass code review orchestration"
---

# Orchestrate Review

Multi-pass code review with parallel Task agents, finding aggregation, and iteration until clean.

## Scope-Based Specialist Selection

Select conditional specialists based on the review scope:
- **User request**: Detect signals from content user refers to (files, directory, module)
- **Workflow (Phase 9)**: Detect signals from changed files only
- **Project audit**: Detect signals from project structure as a whole

## Review Passes

Spawn parallel `general-purpose` Task agents (model: `sonnet`), one per pass:

### Core (Always)
```javascript
const corePasses = [
  { id: 'code-quality', role: 'code quality reviewer',
    focus: ['Style and consistency', 'Best practices', 'Bugs and logic errors', 'Error handling', 'Maintainability', 'Duplication'] },
  { id: 'security', role: 'security reviewer',
    focus: ['Auth/authz flaws', 'Input validation', 'Injection risks', 'Secrets exposure', 'Insecure defaults'] },
  { id: 'performance', role: 'performance reviewer',
    focus: ['N+1 queries', 'Blocking operations', 'Hot path inefficiencies', 'Memory leaks'] },
  { id: 'test-coverage', role: 'test coverage reviewer',
    focus: ['Missing tests', 'Edge case coverage', 'Test quality', 'Integration needs', 'Mock appropriateness'] }
];
```

### Conditional (Signal-Based)
```javascript
if (signals.hasDb) passes.push({ id: 'database', role: 'database specialist',
  focus: ['Query performance', 'Indexes/transactions', 'Migration safety', 'Data integrity'] });
if (signals.needsArchitecture) passes.push({ id: 'architecture', role: 'architecture reviewer',
  focus: ['Module boundaries', 'Dependency direction', 'Cross-layer coupling', 'Pattern consistency'] });
if (signals.hasApi) passes.push({ id: 'api', role: 'api designer',
  focus: ['REST conventions', 'Error/status consistency', 'Pagination/filters', 'Versioning'] });
if (signals.hasFrontend) passes.push({ id: 'frontend', role: 'frontend specialist',
  focus: ['Component boundaries', 'State management', 'Accessibility', 'Render performance'] });
if (signals.hasBackend) passes.push({ id: 'backend', role: 'backend specialist',
  focus: ['Service boundaries', 'Domain logic', 'Concurrency/idempotency', 'Background job safety'] });
if (signals.hasDevops) passes.push({ id: 'devops', role: 'devops reviewer',
  focus: ['CI/CD safety', 'Secrets handling', 'Build/test pipelines', 'Deploy config'] });
```

## Signal Detection

```javascript
const signals = {
  hasDb: files.some(f => /(db|migrations?|schema|prisma|typeorm|sql)/i.test(f)),
  hasApi: files.some(f => /(api|routes?|controllers?|handlers?)/i.test(f)),
  hasFrontend: files.some(f => /\.(tsx|jsx|vue|svelte)$/.test(f)),
  hasBackend: files.some(f => /(server|backend|services?|domain)/i.test(f)),
  hasDevops: files.some(f => /(\.github\/workflows|Dockerfile|k8s|terraform)/i.test(f)),
  needsArchitecture: files.length > 20  // 20+ files typically indicates cross-module changes
};
```

## File Risk Prioritization

Before starting review passes, score changed files by composite risk using `diff-risk` from agent-analyzer. This orders files so reviewers focus on highest-risk code first within each pass.

This step is optional - if repo-intel is unavailable, proceed with the default file ordering.

### Pre-check: Ensure Repo-Intel

```javascript
const fs = require('fs');
const path = require('path');

const { getStateDirPath } = require('@agentsys/lib/platform/state-dir');
const cwd = process.cwd();
const mapFile = path.join(getStateDirPath(cwd), 'repo-intel.json');

if (!fs.existsSync(mapFile)) {
  const response = await AskUserQuestion({
    questions: [{
      question: 'Generate repo-intel?',
      description: 'No repo-intel map found. Generating one enables risk-scored file ordering for review passes. Takes ~5 seconds.',
      options: [
        { label: 'Yes, generate it', value: 'yes' },
        { label: 'Skip', value: 'no' }
      ]
    }]
  });

  if (response === 'yes' || response?.['Generate repo-intel?'] === 'yes') {
    try {
      const { binary } = require('@agentsys/lib');
      const output = binary.runAnalyzer(['repo-intel', 'init', cwd]);
      const stateDirPath = path.join(cwd, stateDir);
      if (!fs.existsSync(stateDirPath)) fs.mkdirSync(stateDirPath, { recursive: true });
      fs.writeFileSync(mapFile, output);
    } catch (e) {
      // Binary not available - proceed without
    }
  }
}
```

### Scoring Changed Files

```javascript
const { binary } = require('@agentsys/lib');

// stateDir and mapFile already defined above

let riskScoredFiles = null;

if (fs.existsSync(mapFile)) {
  const fileList = changedFiles.join(',');
  try {
    const json = binary.runAnalyzer([
      'repo-intel', 'query', 'diff-risk',
      '--files', fileList,
      '--map-file', mapFile,
      cwd
    ]);
    riskScoredFiles = JSON.parse(json);
    // riskScoredFiles is sorted by riskScore descending
  } catch (e) {
    // diff-risk failed - proceed with default ordering
    console.log('[WARN] diff-risk unavailable, using default file order');
  }
}
```

### Applying Risk Order

When `riskScoredFiles` is available, use it to reorder the file list passed to each review pass:

```javascript
// Replace the default file list with risk-ordered list
if (riskScoredFiles) {
  files = riskScoredFiles.map(r => r.path);
}
```

### High-Risk File Scrutiny

Files with `riskScore > 0.5` should receive extra scrutiny. When passing files to review agents, annotate high-risk files so reviewers know to look more carefully:

```javascript
function formatFileList(files, riskScoredFiles) {
  if (!riskScoredFiles) return files.join('\n');
  const riskMap = new Map(riskScoredFiles.map(r => [r.path, r]));
  return files.map(f => {
    const risk = riskMap.get(f);
    if (risk && risk.riskScore > 0.5) {
      return `${f}  [HIGH RISK: score=${risk.riskScore.toFixed(2)}, bugFixRate=${risk.bugFixRate.toFixed(2)}, aiRatio=${risk.aiRatio.toFixed(2)}]`;
    }
    return f;
  }).join('\n');
}
```

The formatted file list replaces `${files.join('\n')}` in the task prompt template below.

## Task Prompt Template

```
You are a ${pass.role}. Review these changed files (ordered by risk, highest first):
${formatFileList(files, riskScoredFiles)}

Files marked [HIGH RISK] have elevated bug-fix rates, single-author ownership, or high AI-contribution ratios. Give these files extra scrutiny.

Focus: ${pass.focus.map(f => `- ${f}`).join('\n')}

Return JSON:
{
  "pass": "${pass.id}",
  "findings": [{
    "file": "path.ts",
    "line": 42,
    "severity": "critical|high|medium|low",
    "description": "Issue",
    "suggestion": "Fix",
    "confidence": "high|medium|low",
    "falsePositive": false
  }]
}

Example findings (diverse passes and severities):

// Security - high severity
{ "file": "src/auth/login.ts", "line": 89, "severity": "high",
  "description": "Password comparison uses timing-vulnerable string equality",
  "suggestion": "Use crypto.timingSafeEqual() instead of ===",
  "confidence": "high", "falsePositive": false }

// Code quality - medium severity
{ "file": "src/utils/helpers.ts", "line": 45, "severity": "medium",
  "description": "Duplicated validation logic exists in src/api/validators.ts:23",
  "suggestion": "Extract to shared lib/validation.ts",
  "confidence": "high", "falsePositive": false }

// Performance - low severity
{ "file": "src/config.ts", "line": 12, "severity": "low",
  "description": "Magic number 3600 should be named constant",
  "suggestion": "const CACHE_TTL_SECONDS = 3600;",
  "confidence": "medium", "falsePositive": false }

// False positive example
{ "file": "src/crypto/hash.ts", "line": 78, "severity": "high",
  "description": "Non-constant time comparison",
  "suggestion": "N/A - intentional for non-secret data",
  "confidence": "low", "falsePositive": true }

Report all issues with confidence >= medium. Empty findings array if clean.
```

## Aggregation

```javascript
function aggregateFindings(results) {
  const items = [];
  for (const {pass, findings = []} of results) {
    for (const f of findings) {
      items.push({
        id: `${pass}:${f.file}:${f.line}:${f.description}`,
        pass, ...f,
        status: f.falsePositive ? 'false-positive' : 'open'
      });
    }
  }

  // Deduplicate by id
  const deduped = [...new Map(items.map(i => [i.id, i])).values()];

  // Group by severity
  const bySeverity = {critical: [], high: [], medium: [], low: []};
  deduped.forEach(i => !i.falsePositive && bySeverity[i.severity || 'low'].push(i));

  const totals = Object.fromEntries(Object.entries(bySeverity).map(([k, v]) => [k, v.length]));

  return {
    items: deduped,
    bySeverity,
    totals,
    openCount: Object.values(totals).reduce((a, b) => a + b, 0)
  };
}
```

## Iteration Loop

**Security Note**: Fixes are applied by the orchestrator using standard Edit tool permissions. Critical/high severity findings should be reviewed before applying - do not blindly apply LLM-suggested fixes to security-sensitive code. The orchestrator validates each fix against the original issue.

```javascript
// 5 iterations balances thoroughness vs cost; 1 stall (2 consecutive identical-hash iterations) indicates fixes aren't progressing
const MAX_ITERATIONS = 5, MAX_STALLS = 1;
let iteration = 1, stallCount = 0, lastHash = null;

while (iteration <= MAX_ITERATIONS) {
  // 1. Spawn parallel Task agents
  const results = await Promise.all(passes.map(pass => Task({
    subagent_type: 'general-purpose',
    model: 'sonnet',
    prompt: /* see template above */
  })));

  // 2. Aggregate findings
  const findings = aggregateFindings(results);

  // 3. Check if done
  if (findings.openCount === 0) {
    workflowState.completePhase({ approved: true, iterations: iteration });
    break;
  }

  // 4. Fix issues (severity order: critical → high → medium → low)
  // Orchestrator reviews each suggestion before applying via Edit tool
  for (const issue of [...findings.bySeverity.critical, ...findings.bySeverity.high,
                          ...findings.bySeverity.medium, ...findings.bySeverity.low]) {
    if (!issue.falsePositive) {
      // Read file, locate issue.line, validate suggestion, apply via Edit tool
      // For complex fixes, use simple-fixer agent pattern
    }
  }

  // 5. Commit
  exec(`git add . && git commit -m "fix: review feedback (iteration ${iteration})"`);

  // 6. Post-iteration deslop
  Task({ subagent_type: 'deslop:deslop-agent', model: 'sonnet' });

  // 7. Stall detection
  const hash = crypto.createHash('sha256')
    .update(JSON.stringify(findings.items.filter(i => !i.falsePositive)))
    .digest('hex');
  stallCount = hash === lastHash ? stallCount + 1 : 0;
  lastHash = hash;

  // 8. Check limits
  if (stallCount >= MAX_STALLS || iteration >= MAX_ITERATIONS) {
    const reason = stallCount >= MAX_STALLS ? 'stall-detected' : 'iteration-limit';
    console.log(`[BLOCKED] Review loop ended: ${reason}. Remaining: ${JSON.stringify(findings.totals)}`);
    // Ask the user before advancing - do not silently proceed to delivery-validation
    const question = `Review loop blocked (${reason}). Open issues remain. How should we proceed?`;
    const response = AskUserQuestion({
      questions: [{
        question,
        header: 'Review Blocked',
        multiSelect: false,
        options: [
          { label: 'Override and proceed', description: 'Advance to delivery-validation with unresolved issues (risky)' },
          { label: 'Abort workflow', description: 'Stop here; open issues must be fixed manually' }
        ]
      }]
    });
    // AskUserQuestion returns { answers: { [questionText]: selectedLabel } }
    const choice = response.answers?.[question] ?? response[question];
    if (choice === 'Override and proceed') {
      workflowState.completePhase({
        approved: false, blocked: true, overridden: true,
        reason, remaining: findings.totals
      });
    } else {
      workflowState.failPhase(`Review blocked: ${reason}. ${JSON.stringify(findings.totals)} issues remain.`);
    }
    break;
  }

  iteration++;
}
```

## Review Queue

Store state at `{stateDir}/review-queue-{timestamp}.json`:
```json
{
  "status": "open|resolved|blocked",
  "scope": { "type": "diff", "files": ["..."] },
  "passes": ["code-quality", "security"],
  "items": [],
  "iteration": 0,
  "stallCount": 0
}
```

Delete when approved. Keep when blocked for orchestrator inspection.

## Cross-Platform Compatibility

This skill uses `Task({ subagent_type: ... })` which is Claude Code syntax. For other platforms:

| Platform | Equivalent Syntax |
|----------|-------------------|
| Claude Code | `Task({ subagent_type: 'general-purpose', model: 'sonnet', prompt: ... })` |
| OpenCode | `spawn_agent({ type: 'general-purpose', model: 'sonnet', prompt: ... })` |
| Codex CLI | `$agent general-purpose --model sonnet --prompt "..."` |

The aggregation and iteration logic remains the same across platforms - only the agent spawning syntax differs.
