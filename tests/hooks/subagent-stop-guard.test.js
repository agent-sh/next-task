'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getStateDir } = require('../../lib/platform/state-dir');

const GUARD_SCRIPT = path.join(__dirname, '..', '..', 'hooks', 'subagent-stop-guard.js');

/**
 * Run the guard script in a given directory.
 * Uses spawnSync to capture both stdout and stderr regardless of exit code.
 */
function runGuard(cwd) {
  const result = spawnSync(process.execPath, [GUARD_SCRIPT], {
    cwd,
    timeout: 5000,
    encoding: 'utf8'
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1
  };
}

/**
 * Create a temporary directory with optional flow.json content.
 */
function createTempDir(flowContent, stateDir) {
  if (!stateDir) stateDir = getStateDir(os.tmpdir());
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-test-'));
  if (flowContent !== undefined) {
    const statePath = path.join(tmpDir, stateDir);
    fs.mkdirSync(statePath, { recursive: true });
    fs.writeFileSync(
      path.join(statePath, 'flow.json'),
      typeof flowContent === 'string' ? flowContent : JSON.stringify(flowContent)
    );
  }
  return tmpDir;
}

function cleanTempDir(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

describe('subagent-stop-guard', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      cleanTempDir(tmpDir);
      tmpDir = null;
    }
  });

  describe('no-op cases (should produce no output)', () => {
    it('exits silently when no flow.json exists', () => {
      tmpDir = createTempDir(undefined);
      const result = runGuard(tmpDir);
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout, '');
      assert.equal(result.stderr, '');
    });

    it('exits silently when flow.json has status completed', () => {
      tmpDir = createTempDir({
        status: 'completed',
        phase: 'complete',
        task: { title: 'Done task' }
      });
      const result = runGuard(tmpDir);
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout, '');
      assert.equal(result.stderr, '');
    });

    it('exits silently when flow.json has status aborted', () => {
      tmpDir = createTempDir({
        status: 'aborted',
        phase: 'implementation',
        task: { title: 'Aborted task' }
      });
      const result = runGuard(tmpDir);
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout, '');
      assert.equal(result.stderr, '');
    });

    it('exits silently when flow.json has status failed', () => {
      tmpDir = createTempDir({
        status: 'failed',
        phase: 'implementation',
        task: { title: 'Failed task' }
      });
      const result = runGuard(tmpDir);
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout, '');
      assert.equal(result.stderr, '');
    });

    it('exits silently when flow.json is corrupted JSON', () => {
      tmpDir = createTempDir('this is not json{{{');
      const result = runGuard(tmpDir);
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout, '');
      assert.equal(result.stderr, '');
    });

    it('exits silently when flow.json is empty', () => {
      tmpDir = createTempDir('');
      const result = runGuard(tmpDir);
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout, '');
      assert.equal(result.stderr, '');
    });

    it('exits silently when phase is complete even if status is in_progress', () => {
      tmpDir = createTempDir({
        status: 'in_progress',
        phase: 'complete',
        task: { title: 'Edge case' }
      });
      const result = runGuard(tmpDir);
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout, '');
      assert.equal(result.stderr, '');
    });
  });

  describe('active workflow (should output enforcement prompt)', () => {
    it('outputs to stderr when workflow is in_progress at implementation phase', () => {
      tmpDir = createTempDir({
        status: 'in_progress',
        phase: 'implementation',
        task: { title: 'Fix the bug' }
      });
      const result = runGuard(tmpDir);
      assert.equal(result.exitCode, 0);
      assert.ok(result.stderr.includes('<subagent-stop-hook>'));
      assert.ok(result.stderr.includes('Workflow Enforcement'));
      assert.ok(result.stderr.includes('Fix the bug'));
      assert.ok(result.stderr.includes('implementation'));
      assert.equal(result.stdout, '');
    });

    it('outputs to stderr when workflow is in_progress at exploration phase', () => {
      tmpDir = createTempDir({
        status: 'in_progress',
        phase: 'exploration',
        task: { title: 'Add feature' }
      });
      const result = runGuard(tmpDir);
      assert.equal(result.exitCode, 0);
      assert.ok(result.stderr.includes('<subagent-stop-hook>'));
      assert.ok(result.stderr.includes('Add feature'));
      assert.ok(result.stderr.includes('exploration'));
    });

    it('includes decision tree and enforcement sections', () => {
      tmpDir = createTempDir({
        status: 'in_progress',
        phase: 'review-loop',
        task: { title: 'Review task' }
      });
      const result = runGuard(tmpDir);
      assert.ok(result.stderr.includes('<decision-tree>'));
      assert.ok(result.stderr.includes('<enforcement>'));
      assert.ok(result.stderr.includes('<workflow-sequence>'));
      assert.ok(result.stderr.includes('<verification-gates>'));
    });

    it('handles missing task title gracefully', () => {
      tmpDir = createTempDir({
        status: 'in_progress',
        phase: 'planning',
        task: {}
      });
      const result = runGuard(tmpDir);
      assert.equal(result.exitCode, 0);
      assert.ok(result.stderr.includes('Unknown'));
    });

    it('handles missing task object gracefully', () => {
      tmpDir = createTempDir({
        status: 'in_progress',
        phase: 'planning'
      });
      const result = runGuard(tmpDir);
      assert.equal(result.exitCode, 0);
      assert.ok(result.stderr.includes('Unknown'));
    });
  });
});
