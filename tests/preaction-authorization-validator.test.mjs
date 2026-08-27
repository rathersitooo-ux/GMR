import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateAuthorization,
  isMaterialPath,
  validateManifest,
} from '../tools/preaction-authorization-validator.mjs';

const recordId = 'VWORK-REQCHECK-R21-LEASEWITNESS-20260827T1733';
const manifestPath = `data/preaction-authorizations/${recordId}.json`;
const baseSha = '097660354fb867735eeb3a7649c7fdc8fd79a7c7';
const nowMs = Date.parse('2026-08-27T08:40:00Z'); // 17:40 JST
const scope = [
  'tools/preaction-authorization-validator.mjs',
  'tests/preaction-authorization-validator.test.mjs',
];
const manifest = {
  schemaVersion: 'gameroad-preaction-v2',
  recordId,
  taskId: 'GITHUB-REQUIRED-CHECKS-POLICY-001',
  workUnitKey: 'LEGACY-WRITER-SNAPSHOT-GATE-BYPASS-HARDENING-R21',
  acquireKey: 'REQCHECK-R21-LEASEWITNESS-20260827T1733-SOL-Q7N4V8K2M6PX',
  riskClass: 'HIGH_CONSEQUENCE',
  predictionStatus: 'PASS',
  predictionEvidenceId: 'REQCHECK-R21-KNOWNFAIL-R20B-20260827T1733',
  rehearsalStatus: 'N_A_ALT_ORACLE',
  rehearsalEvidenceId: 'REQCHECK-R21-LEGACY-V1-FAILCLOSE-20260827T1733',
  proceedToken: `PROCEED|${recordId}|PREACTION_PROCEED_ALLOWED|HIGH_CONSEQUENCE|prediction|lease-snapshot`,
  authorizationBaseSha: baseSha,
  stateModelVersion: 'STATE_MODEL_V1',
  leaseAuthority: 'CURRENT_ACTIVE_LEASES',
  leaseState: 'ACTIVE',
  leaseTaskId: 'GITHUB-REQUIRED-CHECKS-POLICY-001',
  leaseWorkUnitKey: 'LEGACY-WRITER-SNAPSHOT-GATE-BYPASS-HARDENING-R21',
  leaseAcquireKey: 'REQCHECK-R21-LEASEWITNESS-20260827T1733-SOL-Q7N4V8K2M6PX',
  leaseSnapshotReadbackAtJst: '2026-08-27 17:34 JST',
  leaseUntilJst: '2026-08-27 18:20 JST',
  leaseSnapshotReadbackRef: 'CURRENT_ACTIVE_LEASES!A23:L23',
  scope,
  leaseScope: [...scope],
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
    nowMs,
    ...overrides,
  });
}

function validate(candidate = manifest, at = nowMs) {
  return validateManifest(candidate, manifestPath, { nowMs: at });
}

test('material paths are fail-closed while documentation-only paths are nearby-normal', () => {
  assert.equal(isMaterialPath('browser/GAMEROAD.html'), true);
  assert.equal(isMaterialPath('.github/workflows/gameroad-required-gate.yml'), true);
  assert.equal(isMaterialPath('AGENTS.md'), true);
  assert.equal(isMaterialPath('README.md'), false);
  assert.equal(isMaterialPath('docs/notes.md'), false);
  assert.equal(isMaterialPath(manifestPath), false);
});

test('valid v2 manifest with matching active snapshot witness passes', () => {
  assert.deepEqual(validate(), { ok: true, reason: 'lease_witness_valid' });
});

test('legacy v1 event-only style manifest is rejected', () => {
  const legacy = { ...manifest, schemaVersion: 'gameroad-preaction-v1' };
  delete legacy.stateModelVersion;
  delete legacy.leaseAuthority;
  delete legacy.leaseState;
  delete legacy.leaseTaskId;
  delete legacy.leaseWorkUnitKey;
  delete legacy.leaseAcquireKey;
  delete legacy.leaseSnapshotReadbackAtJst;
  delete legacy.leaseUntilJst;
  delete legacy.leaseSnapshotReadbackRef;
  delete legacy.leaseScope;
  assert.equal(validate(legacy).ok, false);
});

test('missing snapshot witness is rejected', () => {
  const bad = { ...manifest };
  delete bad.leaseSnapshotReadbackRef;
  assert.deepEqual(validate(bad), { ok: false, reason: 'manifest_missing_leaseSnapshotReadbackRef' });
});

test('lease acquire identity must match preaction acquire identity', () => {
  const bad = { ...manifest, leaseAcquireKey: 'REQCHECK-OTHER' };
  assert.deepEqual(validate(bad), { ok: false, reason: 'lease_identity_mismatch:acquireKey' });
});

test('lease task and work-unit identities must match', () => {
  assert.deepEqual(validate({ ...manifest, leaseTaskId: 'OTHER' }), { ok: false, reason: 'lease_identity_mismatch:taskId' });
  assert.deepEqual(validate({ ...manifest, leaseWorkUnitKey: 'OTHER' }), { ok: false, reason: 'lease_identity_mismatch:workUnitKey' });
});

test('lease scope must exactly cover the preauthorized material scope', () => {
  const bad = { ...manifest, leaseScope: ['tools/preaction-authorization-validator.mjs'] };
  assert.deepEqual(validate(bad), { ok: false, reason: 'lease_scope_mismatch' });
});

test('expired snapshot witness is rejected at validation time', () => {
  const afterExpiry = Date.parse('2026-08-27T09:21:00Z'); // 18:21 JST
  assert.deepEqual(validate(manifest, afterExpiry), { ok: false, reason: 'lease_expired_at_validation' });
});

test('lease witness cannot claim more than the one-hour current lease window', () => {
  const bad = { ...manifest, leaseUntilJst: '2026-08-27 18:35 JST' };
  assert.deepEqual(validate(bad), { ok: false, reason: 'lease_window_over_one_hour' });
});

test('future-dated snapshot readback beyond clock skew is rejected', () => {
  const bad = { ...manifest, leaseSnapshotReadbackAtJst: '2026-08-27 17:50 JST' };
  assert.deepEqual(validate(bad), { ok: false, reason: 'lease_snapshot_readback_in_future' });
});

test('missing or malformed ProceedToken is rejected', () => {
  const bad = { ...manifest, proceedToken: 'PROCEED|FAKE' };
  assert.equal(validate(bad).ok, false);
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
  const low = {
    ...manifest,
    riskClass: 'LOW_REVERSIBLE',
    proceedToken: `PROCEED|${recordId}|PREACTION_PROCEED_ALLOWED|LOW_REVERSIBLE|prediction|lease-snapshot`,
  };
  const result = check({ manifest: low });
  assert.deepEqual(result, { ok: false, reason: 'material_pr_cannot_use_low_reversible' });
});
