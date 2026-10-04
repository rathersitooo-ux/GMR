import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGameroadOperatorPackage } from '../tools/gameroad-operator-package.mjs';
import {
  QUALITY_GATE_SCHEMA_VERSION,
  validateQualityDecision,
} from '../plugins/gameroad-operator/tools/quality-decision-gate.mjs';

test('GAMEROAD Operator package is internally consistent', () => {
  const result = validateGameroadOperatorPackage();
  assert.equal(result.ok, true, result.errors.join('\n'));
});

function base(overrides = {}) {
  return {
    schemaVersion: QUALITY_GATE_SCHEMA_VERSION,
    materialMutation: true,
    taskId: 'TASK-1',
    workUnitKey: 'WU-1',
    acquireKey: 'ACQ-1',
    userEndState: 'Improve one bounded GAMEROAD consumer.',
    consumerOrUseSite: 'browser/current consumer',
    researchRequired: false,
    reuseDiscoveryRequired: false,
    assetProvenanceRequired: false,
    deletionGuardRequired: false,
    visualEvidenceRequired: false,
    completionClaim: false,
    notRequiredReasons: {
      researchRequired: 'Deterministic same-semantics repair; no decision-changing external unknown.',
      reuseDiscoveryRequired: 'Reusing the current implementation; no new construction.',
      assetProvenanceRequired: 'No asset bytes change.',
      deletionGuardRequired: 'No deletion or replacement.',
      visualEvidenceRequired: 'No player-visible visual change.',
    },
    ...overrides,
  };
}

function validResearch() {
  return [{
    evidencePointer: 'https://example.invalid/reference',
    finding: 'A current external implementation changes the decision.',
    effect: 'Adopt its state-preserving pattern instead of the initial custom design.',
    artifactOrDecisionTarget: 'browser/example.mjs',
  }];
}

function validSignature() {
  return {
    userEndState: 'Reach the bounded consumer outcome.',
    requiredBehaviorOrIO: 'same input/output contract',
    consumerOrUseSite: 'current browser use-site',
    environmentOrPlatform: 'GAMEROAD browser runtime',
    acceptanceEvidence: 'focused test + consumer readback',
  };
}

test('operator quality gate accepts deterministic repair only with explicit not-required reasons', () => {
  assert.deepEqual(validateQualityDecision(base()), { ok: true, reason: 'quality_decision_authorized' });
});

test('operator quality gate rejects silent omission of quality applicability', () => {
  const packet = base();
  delete packet.researchRequired;
  const result = validateQualityDecision(packet);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'applicability_flag_missing:researchRequired');
});

test('operator quality gate rejects false research gate without a reason', () => {
  const packet = base();
  delete packet.notRequiredReasons.researchRequired;
  const result = validateQualityDecision(packet);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not_required_reason_missing:researchRequired');
});

test('operator quality gate rejects research citation without concrete effect', () => {
  const result = validateQualityDecision(base({
    researchRequired: true,
    researchApplications: [{
      evidencePointer: 'source',
      finding: 'finding',
      effect: '',
      artifactOrDecisionTarget: 'target',
    }],
  }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'research_application_missing_effect:0');
});

test('operator quality gate accepts research when finding effect and target are bound', () => {
  assert.equal(validateQualityDecision(base({
    researchRequired: true,
    researchApplications: validResearch(),
  })).ok, true);
});

test('operator quality gate rejects BUILD while reuse frontier remains open', () => {
  const result = validateQualityDecision(base({
    reuseDiscoveryRequired: true,
    solutionSignature: validSignature(),
    reuseDisposition: 'BUILD',
    materialCandidateFrontierOpen: true,
    buildResidualJustification: 'Custom residual remains.',
    reuseCandidates: [{
      candidateClass: 'OSS_PUBLIC',
      decision: 'REVIEW',
      sourcePointer: 'https://example.invalid/oss',
      remainingPathToAcceptance: 'Evaluate integration.',
      versionOrDate: '1.2.3',
      rightsOrLicense: 'MIT',
      maintenanceOrSecurity: 'Maintained; security path documented.',
    }],
  }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'build_blocked_material_candidate_frontier_open');
});

test('operator quality gate allows BUILD only after candidate frontier closes', () => {
  const result = validateQualityDecision(base({
    reuseDiscoveryRequired: true,
    solutionSignature: validSignature(),
    reuseDisposition: 'BUILD',
    materialCandidateFrontierOpen: false,
    buildResidualJustification: 'No candidate satisfies the required offline consumer contract.',
    reuseCandidates: [{
      candidateClass: 'OSS_PUBLIC',
      decision: 'REJECT',
      sourcePointer: 'https://example.invalid/oss',
      remainingPathToAcceptance: 'Would require replacing the current authority.',
      versionOrDate: '1.2.3',
      rightsOrLicense: 'MIT',
      maintenanceOrSecurity: 'Maintained but incompatible authority model.',
    }],
  }));
  assert.equal(result.ok, true);
});

test('operator quality gate rejects external reuse with unresolved rights', () => {
  const result = validateQualityDecision(base({
    assetProvenanceRequired: true,
    assetChanges: [{
      path: 'browser/assets/x.png',
      operation: 'ADD',
      origin: 'EXTERNAL_REUSE',
      sourceUrl: 'https://example.invalid/x.png',
      sourceSha256: 'a'.repeat(64),
      licenseExpression: 'UNKNOWN',
      rightsBasis: 'unknown',
      transformChain: ['download'],
      contentCredentialsStatus: 'NOT_PRESENT',
    }],
  }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'external_asset_rights_unresolved:0');
});

test('operator quality gate accepts external reuse with rights and provenance', () => {
  const result = validateQualityDecision(base({
    assetProvenanceRequired: true,
    assetChanges: [{
      path: 'browser/assets/x.png',
      operation: 'ADD',
      origin: 'EXTERNAL_REUSE',
      sourceUrl: 'https://example.invalid/x.png',
      sourceSha256: 'b'.repeat(64),
      licenseExpression: 'CC0-1.0',
      rightsBasis: 'CC0 source declaration',
      transformChain: ['download', 'crop', 'optimize'],
      contentCredentialsStatus: 'NOT_PRESENT',
    }],
  }));
  assert.equal(result.ok, true);
});

test('operator quality gate rejects formal asset replacement without authority', () => {
  const result = validateQualityDecision(base({
    assetProvenanceRequired: true,
    assetChanges: [{ path: 'formal.png', operation: 'REPLACE', origin: 'USER_FORMAL' }],
  }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'formal_asset_authority_missing:0');
});

test('operator quality gate rejects formal deletion without recoverability', () => {
  const result = validateQualityDecision(base({
    deletionGuardRequired: true,
    deletions: [{
      path: 'formal.png',
      reason: 'superseded by explicit authority',
      humanOrFormalAsset: true,
      authorityEvidence: 'CURRENT:user-explicit',
      recoverableCopyConfirmed: false,
    }],
  }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'formal_deletion_recoverability_missing:0');
});

test('operator quality gate requires external comparable for visual mutation', () => {
  const result = validateQualityDecision(base({
    visualEvidenceRequired: true,
    visualEvidence: {
      currentGameroadActual: 'artifact://current',
      externalComparisonActuals: [],
      comparisonDimensions: ['hierarchy'],
    },
  }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'visual_external_comparison_actuals_missing');
});

test('operator quality gate visual completion requires actual use-site', () => {
  const result = validateQualityDecision(base({
    visualEvidenceRequired: true,
    completionClaim: true,
    visualEvidence: {
      currentGameroadActual: 'artifact://current',
      externalComparisonActuals: ['artifact://reference'],
      comparisonDimensions: ['hierarchy', 'density', 'interaction feedback'],
    },
  }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'visual_consumer_use_site_actual_missing');
});

test('operator quality gate accepts visual completion with full actual evidence', () => {
  const result = validateQualityDecision(base({
    visualEvidenceRequired: true,
    completionClaim: true,
    visualEvidence: {
      currentGameroadActual: 'artifact://current',
      externalComparisonActuals: ['artifact://reference'],
      comparisonDimensions: ['hierarchy', 'density', 'interaction feedback'],
      consumerUseSiteActual: 'artifact://current-live-route',
      regressionOrComparisonResult: 'No regression; intended hierarchy delta verified.',
    },
  }));
  assert.equal(result.ok, true);
});
