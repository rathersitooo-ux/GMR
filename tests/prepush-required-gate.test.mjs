import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPrepushShape,
  deriveConventionalTests,
  findUnmappedExecutablePaths,
  validateAuthorizationBootstrap,
} from '../tools/prepush-required-gate.mjs';

const BASE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const MANIFEST_PATH = 'data/preaction-authorizations/REC.json';

function validManifest() {
  return {
    schemaVersion: 'gameroad-preaction-v3',
    recordId: 'REC',
    taskId: 'GITHUB-CI-BROWSER-NODE-001',
    workUnitKey: 'GITHUB_PREPUSH_ENFORCEMENT_R1',
    acquireKey: 'ACQ',
    riskClass: 'MATERIAL_STANDARD',
    predictionStatus: 'PASS',
    predictionEvidenceId: 'PRED',
    rehearsalStatus: 'PASS',
    rehearsalEvidenceId: 'REH',
    proceedToken: 'PROCEED|REC|PREACTION_PROCEED_ALLOWED|MATERIAL_STANDARD|test',
    authorizationBaseSha: BASE,
    stateModelVersion: 'STATE_MODEL_V1',
    leaseAuthority: 'CURRENT_ACTIVE_LEASES',
    leaseState: 'ACTIVE',
    leaseTaskId: 'GITHUB-CI-BROWSER-NODE-001',
    leaseWorkUnitKey: 'GITHUB_PREPUSH_ENFORCEMENT_R1',
    leaseAcquireKey: 'ACQ',
    leaseSnapshotReadbackAtJst: '2026-09-09 05:35 JST',
    leaseUntilJst: '2026-09-09 06:35 JST',
    leaseSnapshotReadbackRef: 'CURRENT_ACTIVE_LEASES!A640:L640',
    leaseExactMutableResources: 'tools/prepush-required-gate.mjs; tests/prepush-required-gate.test.mjs',
    scope: ['tools/prepush-required-gate.mjs', 'tests/prepush-required-gate.test.mjs'],
    leaseScope: ['tools/prepush-required-gate.mjs', 'tests/prepush-required-gate.test.mjs'],
  };
}

const NOW = Date.parse('2026-09-09T05:40:00+09:00');

test('authorization bootstrap accepts a valid manifest-only first commit', () => {
  const result = validateAuthorizationBootstrap({
    baseSha: BASE,
    headSha: HEAD,
    commits: [HEAD],
    firstParentSha: BASE,
    firstPaths: [MANIFEST_PATH],
    manifestPath: MANIFEST_PATH,
    manifest: validManifest(),
    nowMs: NOW,
  });
  assert.equal(result.ok, true);
});

test('authorization bootstrap rejects lease exact mutable drift', () => {
  const manifest = validManifest();
  manifest.leaseExactMutableResources = 'tools/prepush-required-gate.mjs';
  const result = validateAuthorizationBootstrap({
    baseSha: BASE,
    headSha: HEAD,
    commits: [HEAD],
    firstParentSha: BASE,
    firstPaths: [MANIFEST_PATH],
    manifestPath: MANIFEST_PATH,
    manifest,
    nowMs: NOW,
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /^lease_exact_mutable_scope_mismatch:/);
});

test('authorization bootstrap rejects a mixed first commit', () => {
  const result = validateAuthorizationBootstrap({
    baseSha: BASE,
    headSha: HEAD,
    commits: [HEAD],
    firstParentSha: BASE,
    firstPaths: [MANIFEST_PATH, 'browser/GAMEROAD.html'],
    manifestPath: MANIFEST_PATH,
    manifest: validManifest(),
    nowMs: NOW,
  });
  assert.deepEqual(result, { ok: false, reason: 'first_commit_not_manifest_only' });
});

test('conventional module/test pair is accepted without a second mapping table', () => {
  const existing = new Set(['tools/foo.mjs', 'tests/foo.test.mjs']);
  const unmapped = findUnmappedExecutablePaths(
    ['tools/foo.mjs', 'tests/foo.test.mjs'],
    { fileExists: (value) => existing.has(value), workflowSource: '' },
  );
  assert.deepEqual(unmapped, []);
});

test('new unpaired executable and temporary workflow are rejected before push', () => {
  const existing = new Set(['tools/unpaired.mjs', '.github/workflows/zz-temp-ai.yml']);
  const unmapped = findUnmappedExecutablePaths(
    ['tools/unpaired.mjs', '.github/workflows/zz-temp-ai.yml'],
    { fileExists: (value) => existing.has(value), workflowSource: '' },
  );
  assert.deepEqual(unmapped, ['.github/workflows/zz-temp-ai.yml', 'tools/unpaired.mjs']);
});

test('an exact Required Gate mapping is accepted', () => {
  const existing = new Set(['.github/workflows/browser-node-ci.yml']);
  const workflowSource = "              .github/workflows/browser-node-ci.yml)\n                browser=true";
  const unmapped = findUnmappedExecutablePaths(
    ['.github/workflows/browser-node-ci.yml'],
    { fileExists: (value) => existing.has(value), workflowSource },
  );
  assert.deepEqual(unmapped, []);
});

test('deleted executable paths are left to the server Required Gate deletion safety', () => {
  const unmapped = findUnmappedExecutablePaths(
    ['tools/deleted.mjs', 'tests/deleted.test.mjs'],
    { fileExists: () => false, workflowSource: '' },
  );
  assert.deepEqual(unmapped, []);
});

test('conventional tests are de-duplicated', () => {
  const existing = new Set(['tools/foo.mjs', 'tests/foo.test.mjs']);
  const tests = deriveConventionalTests(
    ['tools/foo.mjs', 'tests/foo.test.mjs', 'tools/foo.mjs'],
    { fileExists: (value) => existing.has(value) },
  );
  assert.deepEqual(tests, ['tests/foo.test.mjs']);
});

test('manifest-only bootstrap is classified before the non-material fast path', () => {
  const shape = classifyPrepushShape({
    changedPaths: [MANIFEST_PATH],
    branchCommits: [HEAD],
    headManifestPaths: [MANIFEST_PATH],
  });
  assert.equal(shape.kind, 'authorization_bootstrap');
});

test('multiple authorization-only commits are rejected instead of silently passing as non-material', () => {
  const shape = classifyPrepushShape({
    changedPaths: [MANIFEST_PATH],
    branchCommits: ['c'.repeat(40), HEAD],
    headManifestPaths: [MANIFEST_PATH],
  });
  assert.equal(shape.kind, 'invalid_authorization_shape');
});
