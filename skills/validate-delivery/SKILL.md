---
name: validate-delivery
description: "Use when user asks to \"validate delivery\", \"check readiness\", or \"verify completion\". Runs tests, build, and requirement checks with pass/fail instructions."
version: 5.2.0
---

# validate-delivery

Autonomously validate that a task is complete and ready to ship.

## Validation Checks

### Check 1: Review Status

```javascript
function checkReviewStatus(reviewResults) {
  if (!reviewResults) return { passed: false, reason: 'No review results' };
  if (reviewResults.approved) return { passed: true };
  if (reviewResults.override) return { passed: true, override: true };
  return { passed: false, reason: 'Review not approved' };
}
```

### Check 2: Tests Pass

```bash
# Detect test runner and run
if grep -q '"test"' package.json; then
  npm test; TEST_EXIT_CODE=$?
elif [ -f "pytest.ini" ]; then
  pytest; TEST_EXIT_CODE=$?
elif [ -f "Cargo.toml" ]; then
  cargo test; TEST_EXIT_CODE=$?
elif [ -f "go.mod" ]; then
  go test ./...; TEST_EXIT_CODE=$?
else
  TEST_EXIT_CODE=0  # No tests
fi
```

### Check 3: Build Passes

```bash
if grep -q '"build"' package.json; then
  npm run build; BUILD_EXIT_CODE=$?
elif [ -f "Cargo.toml" ]; then
  cargo build --release; BUILD_EXIT_CODE=$?
elif [ -f "go.mod" ]; then
  go build ./...; BUILD_EXIT_CODE=$?
else
  BUILD_EXIT_CODE=0  # No build step
fi
```

### Check 4: Requirements Met

```javascript
async function checkRequirementsMet(task, changedFiles) {
  const requirements = extractRequirements(task.description);
  const results = [];

  for (const req of requirements) {
    const implemented = await verifyRequirement(req, changedFiles);
    results.push({ requirement: req, implemented });
  }

  return {
    passed: results.every(r => r.implemented),
    requirements: results
  };
}

function extractRequirements(description) {
  const reqs = [];
  // Extract bullet points: - Item
  const bullets = description.match(/^[-*]\s+(.+)$/gm);
  if (bullets) reqs.push(...bullets.map(m => m.replace(/^[-*]\s+/, '')));
  // Extract numbered items: 1. Item
  const numbered = description.match(/^\d+\.\s+(.+)$/gm);
  if (numbered) reqs.push(...numbered.map(m => m.replace(/^\d+\.\s+/, '')));
  return [...new Set(reqs)].slice(0, 10);
}
```

### Check 5: No Regressions

```bash
# Compare test counts before/after changes
git stash
BEFORE=$(npm test 2>&1 | grep -oE '[0-9]+ passing' | grep -oE '[0-9]+')
git stash pop
AFTER=$(npm test 2>&1 | grep -oE '[0-9]+ passing' | grep -oE '[0-9]+')
[ "$AFTER" -lt "$BEFORE" ] && REGRESSION=true || REGRESSION=false
```

### Check 6: Diff Risk (optional, advisory)

Score changed files by composite risk using repo-intel. This check is advisory - it never causes pass/fail on its own, but raises the bar for high-risk files.

```javascript
const { binary } = require('@agentsys/lib');
const fs = require('fs');
const path = require('path');

function checkDiffRisk(cwd) {
  // Detect platform state directory
  const stateDir = ['.claude', '.opencode', '.codex']
    .find(d => fs.existsSync(path.join(cwd, d))) || '.claude';
  const mapFile = path.join(cwd, stateDir, 'repo-intel.json');

  if (!fs.existsSync(mapFile)) {
    return { available: false, reason: 'No repo-intel map found' };
  }

  // Get changed files via git
  const changedFiles = getChangedFiles(cwd); // git diff --name-only origin/main..HEAD
  if (!changedFiles.length) {
    return { available: false, reason: 'No changed files' };
  }
  const fileList = changedFiles.join(',');

  try {
    const json = binary.runAnalyzer([
      'repo-intel', 'query', 'diff-risk',
      '--files', fileList,
      '--map-file', mapFile,
      cwd
    ]);
    const risks = JSON.parse(json);

    const elevated = risks.filter(r => r.riskScore > 0.5);
    const high = risks.filter(r => r.riskScore > 0.7);
    const requiresTestEvidence = risks.filter(r => r.riskScore > 0.6);
    const requiresHumanReview = risks.filter(r => r.riskScore > 0.7);

    const parts = [];
    if (elevated.length > 0) parts.push(`${elevated.length} files at elevated risk (>0.5)`);
    if (high.length > 0) parts.push(`${high.length} files at high risk (>0.7)`);
    const summary = parts.length > 0 ? parts.join(', ') : 'All files at normal risk';

    return {
      available: true,
      risks,
      summary,
      requiresTestEvidence: requiresTestEvidence.map(r => r.path),
      requiresHumanReview: requiresHumanReview.map(r => r.path),
    };
  } catch (e) {
    return { available: false, reason: 'diff-risk query failed' };
  }
}
```

#### Risk Escalation Rules

Risk scores modify validation strictness but never override pass/fail:

- **riskScore > 0.6**: Require explicit test coverage evidence for those files. "Tests pass" alone is insufficient - the validator must confirm that tests specifically exercise the high-risk files, not just that the suite passes.
- **riskScore > 0.7**: Flag for additional human review before shipping. Include `requiresHumanReview` in the output so the orchestrator can prompt for confirmation.

## Aggregate Results

```javascript
const diffRisk = checkDiffRisk(cwd);

const checks = {
  reviewClean: checkReviewStatus(reviewResults),
  testsPassing: { passed: TEST_EXIT_CODE === 0 },
  buildPassing: { passed: BUILD_EXIT_CODE === 0 },
  requirementsMet: await checkRequirementsMet(task, changedFiles),
  noRegressions: { passed: !REGRESSION },
  diffRisk: diffRisk.available
    ? { passed: true, advisory: true, summary: diffRisk.summary,
        requiresTestEvidence: diffRisk.requiresTestEvidence,
        requiresHumanReview: diffRisk.requiresHumanReview }
    : { passed: true, advisory: true, skipped: true, reason: diffRisk.reason }
};

// diffRisk is always passed:true - it is advisory only and never blocks shipping
const allPassed = Object.values(checks).every(c => c.passed);
const failedChecks = Object.entries(checks)
  .filter(([_, v]) => !v.passed)
  .map(([k]) => k);
```

## Decision and Output

### If All Pass

```javascript
const riskSummary = diffRisk.available ? diffRisk.summary : null;

workflowState.completePhase({
  approved: true,
  checks,
  summary: 'All validation checks passed',
  ...(riskSummary && { riskSummary })
});

return { approved: true, checks, ...(riskSummary && { riskSummary }) };
```

### If Any Fail

```javascript
const fixInstructions = generateFixInstructions(checks, failedChecks);
const riskSummary = diffRisk.available ? diffRisk.summary : null;

workflowState.failPhase('Validation failed', {
  approved: false,
  failedChecks,
  fixInstructions,
  ...(riskSummary && { riskSummary })
});

return { approved: false, failedChecks, fixInstructions, ...(riskSummary && { riskSummary }) };
```

## Fix Instructions Generator

```javascript
function generateFixInstructions(checks, failedChecks) {
  const instructions = [];

  if (failedChecks.includes('testsPassing')) {
    instructions.push({ action: 'Fix failing tests', command: 'npm test' });
  }
  if (failedChecks.includes('buildPassing')) {
    instructions.push({ action: 'Fix build errors', command: 'npm run build' });
  }
  if (failedChecks.includes('requirementsMet')) {
    const unmet = checks.requirementsMet.requirements
      .filter(r => !r.implemented)
      .map(r => r.requirement);
    instructions.push({ action: 'Implement missing', details: unmet.join(', ') });
  }

  // Risk-aware instructions (advisory - added alongside other instructions)
  if (checks.diffRisk && !checks.diffRisk.skipped) {
    if (checks.diffRisk.requiresTestEvidence?.length > 0) {
      instructions.push({
        action: 'Verify test coverage for high-risk files',
        details: checks.diffRisk.requiresTestEvidence.join(', '),
        advisory: true
      });
    }
    if (checks.diffRisk.requiresHumanReview?.length > 0) {
      instructions.push({
        action: 'Flag for human review before shipping',
        details: checks.diffRisk.requiresHumanReview.join(', '),
        advisory: true
      });
    }
  }

  return instructions;
}
```

## Output Format

```json
{
  "approved": true|false,
  "checks": {
    "reviewClean": { "passed": true },
    "testsPassing": { "passed": true },
    "buildPassing": { "passed": true },
    "requirementsMet": { "passed": true },
    "noRegressions": { "passed": true },
    "diffRisk": {
      "passed": true,
      "advisory": true,
      "summary": "3 files at elevated risk (>0.5), 1 file at high risk (>0.7)",
      "requiresTestEvidence": ["lib/core.js"],
      "requiresHumanReview": ["lib/auth.js"]
    }
  },
  "failedChecks": [],
  "fixInstructions": [],
  "riskSummary": "3 files at elevated risk (>0.5), 1 file at high risk (>0.7)"
}
```

When repo-intel is unavailable, `diffRisk` shows as skipped:

```json
{
  "diffRisk": { "passed": true, "advisory": true, "skipped": true, "reason": "No repo-intel map found" }
}
```

## Constraints

- NO human intervention - fully autonomous
- Returns structured JSON for orchestrator
- Generates specific fix instructions on failure
- Workflow retries automatically after fixes
