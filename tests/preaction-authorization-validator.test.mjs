import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateAuthorization,
  isMaterialPath,
  validateManifest,
} from '../tools/preaction-authorization-validator.mjs';

const recordId = 'VWORK-REQCHECK-R18-CURRENTMAIN-PREACTION-GATE-20260825T0158';
const manifestPath = `data/preaction-authorizations/${recordId}.json`;
const baseSha = 'f57173b295a6487b15d6b2c037fafe598026f324';
const manifest = {
  schemaVersion: 'gameroad-preaction-v1',
  recordId,
  taskId: 'GITHUB-REQUIRED-CHECKS-POLICY-001',
  workUnitKey: 'REQCHECK-R18-CURRENTMAIN-PREACTION-GATE',
  acquireKey: 'REQCHECK-R18-CURRENTMAIN-PREACTION-GATE-20260825T0158-SOL-Q6N8V4K2M7PX',
  riskClass: 'HIGH_CONSEQUENCE',
  predictionStatus: 'PASS',
  predictionEvidenceId: 'REQCHECK-R18-PRED-20260825T0158',
  rehearsalStatus: 'N_A_ALT_ORACLE',
  rehearsalEvidenceId: 'REQCHECK-R18-ALTORACLE-20260825T0158',
  proceedToken: `PROCEED|${recordId}|PREACTION_PROCEED_ALLOWED|HIGH_CONSEQUENCE|prediction|rehearsal`,
  authorizationBaseSha: baseSha,
  scope: [
    '.github/workflows/gameroad-required-gate.yml',
    'tools/preaction-authorization-validator.mjs',
    'tests/preaction-authorization-validator.test.mjs',
  ],
};
const firstCommit = { sha: '1'.repeat(40), parentSha: baseSha, paths: [manifestPath] };

function check(overrides = {}) {
  return evaluateAuthorization({
    commits: [firstCommit],
    manifest,
    manifestPath,
    changedPaths: ['tools/preaction-authorization-validator.mjs'],
    historyPaths: ['tools/preaction-authorization-validator.mjs'],
    manifestPresentAtHead: false,
    ...overrides,
  });
}

test('material paths are fail-closed while documentation-only paths are nearby-normal', () => {
  assert.equal(isMaterialPath('browser/GAMEROAD.html'), true);
  assert.equal(isMaterialPath('.github/workflows/gameroad-required-gate.yml'), true);
  assert.equal(isMaterialPath('AGENTS.md'), true);
  assert.equal(isMaterialPath('README.md'), false);
  assert.equal(isMaterialPath('docs/notes.md'), false);
  assert.equal(isMaterialPath(manifestPath), false);
});

test('valid manifest shape passes', () => {
  assert.deepEqual(validateManifest(manifest, manifestPath), { ok: true, reason: 'manifest_valid' });
});

test('missing or malformed ProceedToken is rejected', () => {
  const bad = { ...manifest, proceedToken: 'PROCEED|FAKE' };
  assert.equal(validateManifest(bad, manifestPath).ok, false);
});

test('authorization must be the first commit from its recorded base', () => {
  const result = check({ commits: [{ ...firstCommit, parentSha: '2'.repeat(40) }] });
  assert.deepEqual(result, { ok: false, reason: 'authorization_not_first_from_base' });
});

test('authorization commit may contain only its manifest', () => {
  const result = check({ commits: [{ ...firstCommit, paths: [manifestPath, 'tools/late.mjs'] }] });
  assert.deepEqual(result, { ok: false, reason: 'first_commit_not_manifest_only' });
});

test('material path outside preauthorized scope is rejected', () => {
  const result = check({ changedPaths: ['browser/GAMEROAD.html'], historyPaths: ['browser/GAMEROAD.html'] });
  assert.match(result.reason, /^material_path_out_of_scope:/);
});

test('transient material path cannot be hidden by deleting it before final diff', () => {
  const result = check({
    changedPaths: ['tools/preaction-authorization-validator.mjs'],
    historyPaths: ['tools/preaction-authorization-validator.mjs', '.github/workflows/tmp-hidden-executor.yml'],
  });
  assert.match(result.reason, /^material_path_out_of_scope:.*tmp-hidden-executor/);
});

test('authorization manifest must be cleanup-deleted before merge', () => {
  const result = check({ manifestPresentAtHead: true });
  assert.deepEqual(result, { ok: false, reason: 'authorization_manifest_must_be_cleanup_deleted_before_merge' });
});

test('manifest-first scoped material change passes after cleanup', () => {
  assert.deepEqual(check(), { ok: true, reason: 'preaction_authorized' });
});

test('documentation-only PR is not overblocked', () => {
  const result = check({ changedPaths: ['README.md'], historyPaths: ['README.md'], manifestPresentAtHead: true });
  assert.deepEqual(result, { ok: true, reason: 'nonmaterial_pr' });
});

test('LOW_REVERSIBLE cannot authorize a material PR', () => {
  const low = { ...manifest, riskClass: 'LOW_REVERSIBLE', proceedToken: `PROCEED|${recordId}|PREACTION_PROCEED_ALLOWED|LOW_REVERSIBLE|prediction|rehearsal` };
  const result = check({ manifest: low });
  assert.deepEqual(result, { ok: false, reason: 'material_pr_cannot_use_low_reversible' });
});
