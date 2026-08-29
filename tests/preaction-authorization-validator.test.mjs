import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateAuthorization,
  isMaterialPath,
  validateManifest,
} from '../tools/preaction-authorization-validator.mjs';

const recordId = 'VWORK-REQCHECK-R24-EXACTMUTABLE-20260827T1947';
const manifestPath = `data/preaction-authorizations/${recordId}.json`;
const baseSha = 'a4d7b147c549f093d9b5ea24e6cb6a2c702a801c';
const nowMs = Date.parse('2026-08-27T10:50:00Z'); // 19:50 JST
const scope = [
  'tools/preaction-authorization-validator.mjs',
  'tests/preaction-authorization-validator.test.mjs',
];
const benignExactMutableResources = [
  'GITHUB:rathersitooo-ux/GMR branch work/requiredgate-parent-summary-v3-20260827 only: tools/preaction-authorization-validator.mjs',
  'tests/preaction-authorization-validator.test.mjs',
  'CURRENT_ACTIVE_LEASES own AcquireKey row only',
].join('; ');
const manifest = {
  schemaVersion: 'gameroad-preaction-v3',
  recordId,
  taskId: 'GITHUB-REQUIRED-CHECKS-POLICY-001',
  workUnitKey: 'PARENTTASK_OS_EXACTMUTABLE_PREACTION_V3_R24',
  acquireKey: 'REQCHECK-PARENTSUMMARY-V3-R24-20260827T1947-SOL-Q8N4V7K2M6PX',
  riskClass: 'HIGH_CONSEQUENCE',
  predictionStatus: 'PASS',
  predictionEvidenceId: 'REQCHECK-R24-EXACTMUTABLE-GAP',
  rehearsalStatus: 'N_A_ALT_ORACLE',
  rehearsalEvidenceId: 'REQCHECK-R21-DATAVALIDATION-BYPASS',
  proceedToken: `PROCEED|${recordId}|PREACTION_PROCEED_ALLOWED|HIGH_CONSEQUENCE|prediction|lease-snapshot`,
  authorizationBaseSha: baseSha,
  stateModelVersion: 'STATE_MODEL_V1',
  leaseAuthority: 'CURRENT_ACTIVE_LEASES',
  leaseState: 'ACTIVE',
  leaseTaskId: 'GITHUB-REQUIRED-CHECKS-POLICY-001',
  leaseWorkUnitKey: 'PARENTTASK_OS_EXACTMUTABLE_PREACTION_V3_R24',
  leaseAcquireKey: 'REQCHECK-PARENTSUMMARY-V3-R24-20260827T1947-SOL-Q8N4V7K2M6PX',
  leaseSnapshotReadbackAtJst: '2026-08-27 19:47 JST',
  leaseUntilJst: '2026-08-27 20:30 JST',
  leaseSnapshotReadbackRef: 'CURRENT_ACTIVE_LEASES!A183:L183',
  leaseExactMutableResources: benignExactMutableResources,
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

function parentSummaryManifest(overrides = {}) {
  const taskId = overrides.taskId ?? 'GITHUB-REQUIRED-CHECKS-POLICY-001';
  const workUnitKey = overrides.workUnitKey ?? manifest.workUnitKey;
  return {
    ...manifest,
    taskId,
    leaseTaskId: taskId,
    workUnitKey,
    leaseWorkUnitKey: workUnitKey,
    leaseExactMutableResources: `${benignExactMutableResources}; GAMEROAD 全作業一覧 O2:S1372 literal values`,
    ...overrides,
  };
}

function novelReuseManifest(overrides = {}) {
  const riskClass = 'MATERIAL_NOVEL';
  return {
    ...manifest,
    riskClass,
    proceedToken: `PROCEED|${recordId}|PREACTION_PROCEED_ALLOWED|${riskClass}|reuse-test`,
    solutionSignature: 'Need a bounded implementation with the same user-visible outcome and acceptance contract.',
    reuseDisposition: 'ADAPT',
    solutionSearchStatus: 'PASS',
    reuseDecisionEvidenceId: 'reuse-decision:test-fixture',
    solutionSearchEvidence: ['external:known-implementation'],
    ...overrides,
  };
}

test('material paths are fail-closed while documentation-only paths are nearby-normal', () => {
  assert.equal(isMaterialPath('browser/GAMEROAD.html'), true);
  assert.equal(isMaterialPath('.github/workflows/gameroad-required-gate.yml'), true);
  assert.equal(isMaterialPath('AGENTS.md'), true);
  assert.equal(isMaterialPath('README.md'), false);
  assert.equal(isMaterialPath('docs/notes.md'), false);
  assert.equal(isMaterialPath(manifestPath), false);
});

test('valid v3 manifest with matching active snapshot and exact mutable resource witness passes', () => {
  assert.deepEqual(validate(), { ok: true, reason: 'lease_exact_mutable_resources_valid' });
});

test('legacy v2 manifest is rejected after exact-mutable cutover', () => {
  assert.deepEqual(validate({ ...manifest, schemaVersion: 'gameroad-preaction-v2' }), { ok: false, reason: 'manifest_schema' });
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
  delete legacy.leaseExactMutableResources;
  delete legacy.leaseScope;
  assert.equal(validate(legacy).ok, false);
});

test('missing snapshot witness is rejected', () => {
  const bad = { ...manifest };
  delete bad.leaseSnapshotReadbackRef;
  assert.deepEqual(validate(bad), { ok: false, reason: 'manifest_missing_leaseSnapshotReadbackRef' });
});

test('missing exact mutable resource witness is rejected', () => {
  const bad = { ...manifest };
  delete bad.leaseExactMutableResources;
  assert.deepEqual(validate(bad), { ok: false, reason: 'manifest_missing_leaseExactMutableResources' });
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

test('every preauthorized repo path must appear in lease ExactMutableResources', () => {
  const bad = {
    ...manifest,
    leaseExactMutableResources: 'GITHUB:rathersitooo-ux/GMR only: tools/preaction-authorization-validator.mjs',
  };
  assert.deepEqual(validate(bad), {
    ok: false,
    reason: 'lease_exact_mutable_scope_mismatch:tests/preaction-authorization-validator.test.mjs',
  });
});

test('ParentTask O:S is rejected for ordinary tasks', () => {
  assert.deepEqual(validate(parentSummaryManifest()), {
    ok: false,
    reason: 'parenttask_summary_mutation_forbidden:task',
  });
});

test('central ParentTask O:S shorthand is also rejected for ordinary tasks', () => {
  const bad = parentSummaryManifest({
    leaseExactMutableResources: `${benignExactMutableResources}; central ParentTask O:S value paste`,
  });
  assert.deepEqual(validate(bad), {
    ok: false,
    reason: 'parenttask_summary_mutation_forbidden:task',
  });
});

test('OPS-STATE-SYNC alone does not authorize ParentTask O:S mutation', () => {
  const bad = parentSummaryManifest({ taskId: 'OPS-STATE-SYNC-001' });
  assert.deepEqual(validate(bad), {
    ok: false,
    reason: 'parenttask_summary_mutation_forbidden:workunit',
  });
});

test('formula-repair work-unit still fails when O:S resource is not formula-repair-only', () => {
  const workUnitKey = 'PARENTTASK_OS_FORMULA_REPAIR_R25';
  const bad = parentSummaryManifest({
    taskId: 'OPS-STATE-SYNC-001',
    workUnitKey,
    leaseWorkUnitKey: workUnitKey,
  });
  assert.deepEqual(validate(bad), {
    ok: false,
    reason: 'parenttask_summary_mutation_forbidden:not_formula_repair_only',
  });
});

test('OPS-STATE-SYNC exact O:S formula-repair-only resource is permitted', () => {
  const workUnitKey = 'PARENTTASK_OS_FORMULA_REPAIR_R25';
  const good = parentSummaryManifest({
    taskId: 'OPS-STATE-SYNC-001',
    workUnitKey,
    leaseWorkUnitKey: workUnitKey,
    leaseExactMutableResources: `${benignExactMutableResources}; GAMEROAD 全作業一覧 O2:S1372 formula-repair only`,
  });
  assert.deepEqual(validate(good), { ok: true, reason: 'parenttask_summary_formula_repair_authorized' });
});

test('expired authorization lease remains a valid frozen witness after the work window closes', () => {
  const afterExpiry = Date.parse('2026-08-27T11:31:00Z'); // 20:31 JST
  assert.deepEqual(validate(manifest, afterExpiry), { ok: true, reason: 'lease_exact_mutable_resources_valid' });
});

test('expired authorization witness plus unrelated base advance remains authorized', () => {
  const afterExpiry = Date.parse('2026-08-27T11:31:00Z'); // 20:31 JST
  const result = check({
    nowMs: afterExpiry,
    currentBaseSha: 'b'.repeat(40),
    baseAdvanceIsAncestor: true,
    baseAdvanceChangedPaths: ['browser/unrelated-feature.mjs'],
  });
  assert.deepEqual(result, { ok: true, reason: 'preaction_authorized' });
});

test('lease witness cannot claim more than the one-hour current lease window', () => {
  const bad = { ...manifest, leaseUntilJst: '2026-08-27 20:48 JST' };
  assert.deepEqual(validate(bad), { ok: false, reason: 'lease_window_over_one_hour' });
});

test('future-dated snapshot readback beyond clock skew is rejected', () => {
  const bad = { ...manifest, leaseSnapshotReadbackAtJst: '2026-08-27 19:56 JST' };
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

test('unrelated current-base advance does not invalidate an authorized branch', () => {
  const result = check({
    currentBaseSha: 'b'.repeat(40),
    baseAdvanceIsAncestor: true,
    baseAdvanceChangedPaths: ['browser/unrelated-feature.mjs'],
  });
  assert.deepEqual(result, { ok: true, reason: 'preaction_authorized' });
});

test('current-base advance touching authorized scope is rejected', () => {
  const result = check({
    currentBaseSha: 'b'.repeat(40),
    baseAdvanceIsAncestor: true,
    baseAdvanceChangedPaths: ['tools/preaction-authorization-validator.mjs'],
  });
  assert.deepEqual(result, {
    ok: false,
    reason: 'authorization_base_advance_overlap:tools/preaction-authorization-validator.mjs',
  });
});

test('current-base advance touching PREACTION control plane is rejected even outside manifest scope', () => {
  const result = check({
    currentBaseSha: 'b'.repeat(40),
    baseAdvanceIsAncestor: true,
    baseAdvanceChangedPaths: ['.github/workflows/gameroad-required-gate.yml'],
  });
  assert.deepEqual(result, {
    ok: false,
    reason: 'authorization_base_advance_overlap:.github/workflows/gameroad-required-gate.yml',
  });
});

test('non-ancestor current base requires fresh authorization', () => {
  const result = check({
    currentBaseSha: 'b'.repeat(40),
    baseAdvanceIsAncestor: false,
    baseAdvanceChangedPaths: [],
  });
  assert.deepEqual(result, { ok: false, reason: 'authorization_base_not_ancestor_of_current_base' });
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

test('novel construction cannot proceed when solution-existence evidence was skipped', () => {
  const candidate = novelReuseManifest();
  delete candidate.solutionSignature;
  delete candidate.reuseDisposition;
  delete candidate.solutionSearchStatus;
  delete candidate.reuseDecisionEvidenceId;
  delete candidate.solutionSearchEvidence;
  const result = check({ manifest: candidate, enforceReuseDiscovery: true });
  assert.deepEqual(result, { ok: false, reason: 'reuse_gate_missing_solutionSignature' });
});

test('novel ADAPT path passes when reuse decision and search evidence are explicit', () => {
  const result = check({ manifest: novelReuseManifest(), enforceReuseDiscovery: true });
  assert.deepEqual(result, { ok: true, reason: 'preaction_authorized' });
});

test('BUILD is residual and requires an explicit remaining-gap reason', () => {
  const result = check({
    manifest: novelReuseManifest({ reuseDisposition: 'BUILD' }),
    enforceReuseDiscovery: true,
  });
  assert.deepEqual(result, { ok: false, reason: 'reuse_gate_build_residual_reason_required' });
});

test('BUILD remains available after discovery when the residual gap is explicit', () => {
  const result = check({
    manifest: novelReuseManifest({
      reuseDisposition: 'BUILD',
      buildResidualReason: 'Available implementations cannot satisfy the bounded acceptance contract without replacing their core.',
    }),
    enforceReuseDiscovery: true,
  });
  assert.deepEqual(result, { ok: true, reason: 'preaction_authorized' });
});

test('novel work cannot bypass discovery by claiming NOT_APPLICABLE', () => {
  const result = check({
    manifest: novelReuseManifest({
      reuseDisposition: 'NOT_APPLICABLE',
      solutionSearchStatus: 'NOT_APPLICABLE',
      reuseNotApplicableReason: 'claimed local-only change',
    }),
    enforceReuseDiscovery: true,
  });
  assert.deepEqual(result, { ok: false, reason: 'reuse_gate_novel_cannot_be_not_applicable' });
});

test('nearby standard edit is not forced through reuse discovery', () => {
  const result = check({ enforceReuseDiscovery: true, newMaterialPaths: [] });
  assert.deepEqual(result, { ok: true, reason: 'preaction_authorized' });
});

test('standard newly-created implementation may use NOT_APPLICABLE only with an explicit reason', () => {
  const noReason = check({
    manifest: {
      ...manifest,
      solutionSignature: 'Add a bounded repository-local implementation file.',
      reuseDisposition: 'NOT_APPLICABLE',
      solutionSearchStatus: 'NOT_APPLICABLE',
      reuseDecisionEvidenceId: 'reuse-decision:standard-na',
    },
    enforceReuseDiscovery: true,
    newMaterialPaths: ['tools/new-local-adapter.mjs'],
  });
  assert.deepEqual(noReason, { ok: false, reason: 'reuse_gate_missing_reuseNotApplicableReason' });

  const withReason = check({
    manifest: {
      ...manifest,
      solutionSignature: 'Add a bounded repository-local implementation file.',
      reuseDisposition: 'NOT_APPLICABLE',
      solutionSearchStatus: 'NOT_APPLICABLE',
      reuseDecisionEvidenceId: 'reuse-decision:standard-na',
      reuseNotApplicableReason: 'The file only binds an already-selected local interface and has no standalone solution surface.',
    },
    enforceReuseDiscovery: true,
    newMaterialPaths: ['tools/new-local-adapter.mjs'],
  });
  assert.deepEqual(withReason, { ok: true, reason: 'preaction_authorized' });
});

test('DEFER cannot be converted into mutation authority', () => {
  const result = check({
    manifest: novelReuseManifest({ reuseDisposition: 'DEFER' }),
    enforceReuseDiscovery: true,
  });
  assert.deepEqual(result, { ok: false, reason: 'reuse_gate_defer_cannot_authorize_mutation' });
});

test('reuse disposition needs concrete solution-search evidence, not a bare label', () => {
  const result = check({
    manifest: novelReuseManifest({ solutionSearchEvidence: [] }),
    enforceReuseDiscovery: true,
  });
  assert.deepEqual(result, { ok: false, reason: 'reuse_gate_solution_search_evidence_invalid' });
});
