import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPartnerAdviceResponsePlanInput,
  createPartnerAdviceReplayBridge,
  createPartnerAdviceRuntimeControl,
  projectPartnerAdviceBoardEmphasis,
} from '../browser/partner-advice-runtime-mount.mjs';

const V = Object.freeze({ rulesVersion: 'rules-r1', cardVersion: 'cards-r1', stateVersion: 'state-r1' });
const RUNTIME_STATE = Object.freeze({ phase: 'plan', turnBand: 'early', pressureBand: 'low', manaBand: 'mid', handBand: 'three' });
const FINGERPRINT = 'rules=rules-r1|cards=cards-r1|state=state-r1|phase=plan|turnBand=early|pressureBand=low|manaBand=mid|handBand=three';

function candidate(candidateId, positionOrder, comparisonValue, payload = { label: candidateId }) {
  return { candidateId, kind: 'card', positionOrder, comparisonValue, legal: true, publicScope: true, assetAction: 'NONE', payload };
}

function legacyReplay({ rule, candidates }) {
  const legal = candidates.filter((x) => x.legal !== false);
  const ordered = [...legal].sort((a, b) => {
    if (rule === 'left') return a.positionOrder - b.positionOrder || a.candidateId.localeCompare(b.candidateId);
    if (rule === 'right') return b.positionOrder - a.positionOrder || a.candidateId.localeCompare(b.candidateId);
    if (rule === 'max') return b.comparisonValue - a.comparisonValue || a.candidateId.localeCompare(b.candidateId);
    return a.comparisonValue - b.comparisonValue || a.candidateId.localeCompare(b.candidateId);
  });
  return { ok: true, selected: ordered[0] ?? null, ordered: ordered.map((x) => x.candidateId), source: 'legacy' };
}

function heuristicAdvice(overrides = {}) {
  return {
    ok: true,
    selected: { candidateId: 'guard', payload: { label: 'public-only' } },
    ordered: ['guard', 'advance'],
    next: 'advance',
    reason: 'LEFTMOST',
    source: 'shared-legal-action-core',
    containsPrivate: false,
    ...overrides,
  };
}

function responsePlanRuntimeManifest(overrides = {}) {
  return {
    schema: 'gameroad.partner-advice-runtime-manifest.v1',
    targetVersions: { ...V },
    approval: {
      gateId: 'HUMAN-HOLDOUT-ACCEPTANCE',
      approvalId: 'approval-runtime-7',
      humanGate: 'approved',
      privacyScope: 'shared',
    },
    promotionSafe: true,
    defaultActionId: 'guard',
    minContextSupport: 8,
    contexts: [],
    sourceEvidence: 'offline-approved-aggregate-only',
    containsRawEvents: false,
    containsPrivate: false,
    collectiveDecisionLineage: {
      decisionProductId: 'decision-product-7',
      proposalId: 'proposal-7',
      changeRef: 'change-ranking-7',
      cohortId: 'cohort-7',
      consumerUseSiteRef: 'use-site-advice-selection',
      automaticMutationAllowed: false,
      personaMutationAllowed: false,
      relationshipMutationAllowed: false,
      containsRawEvents: false,
      containsPrivate: false,
    },
    ...overrides,
  };
}

test('missing formal version tuple keeps the exact legacy production path', () => {
  const rows = [candidate('b', 1, 5), candidate('a', 0, 3)];
  let calls = 0;
  const bridge = createPartnerAdviceReplayBridge({ legacyReplay: (input) => { calls++; return legacyReplay(input); } });
  const result = bridge(rows, 'left');
  assert.equal(calls, 1);
  assert.equal(result.source, 'legacy');
  assert.equal(result.selected.candidateId, 'a');
});

test('formal versions activate shared legal-action core without changing deterministic rule choice', () => {
  const rows = [candidate('b', 1, 5), candidate('a', 0, 3, { label: 'public-a' })];
  const bridge = createPartnerAdviceReplayBridge({ legacyReplay, getVersions: () => V });
  const result = bridge(rows, 'left');
  assert.equal(result.source, 'shared-legal-action-core');
  assert.equal(result.selected.candidateId, 'a');
  assert.deepEqual(result.selected.payload, { label: 'public-a' });
  assert.deepEqual(result.ordered, ['a', 'b']);
});

test('approved manifest can override the rule only inside current legal public candidates', () => {
  const rows = [candidate('heuristic', 0, 3), candidate('learned', 1, 5)];
  const manifest = {
    schema: 'gameroad.partner-advice-runtime-manifest.v1',
    targetVersions: { ...V },
    approval: { gateId: 'HUMAN-HOLDOUT-ACCEPTANCE', approvalId: 'approval-r4', humanGate: 'approved', privacyScope: 'shared' },
    promotionSafe: true,
    defaultActionId: 'heuristic',
    minContextSupport: 8,
    contexts: [{ fingerprint: FINGERPRINT, actionId: 'learned', support: 12 }],
    sourceEvidence: 'offline-approved-aggregate-only',
    containsRawEvents: false,
    containsPrivate: false,
    livePlayerPerformanceProven: false,
  };
  const bridge = createPartnerAdviceReplayBridge({
    legacyReplay,
    getVersions: () => V,
    getManifest: () => manifest,
    getRuntimeState: () => RUNTIME_STATE,
  });
  const result = bridge(rows, 'left');
  assert.equal(result.source, 'approved-runtime-manifest');
  assert.equal(result.manifestUsed, true);
  assert.equal(result.selected.candidateId, 'learned');
});

test('runtime control rejects invented/partial versions and exposes activation status', () => {
  const control = createPartnerAdviceRuntimeControl();
  assert.deepEqual(control.status(), { versionReady: false, manifestReady: false, runtimeStateReady: false, mode: 'legacy-fallback' });
  assert.equal(control.setVersions({ rulesVersion: 'rules-r1' }), false);
  assert.equal(control.setVersions(V), true);
  assert.equal(control.status().mode, 'shared-rule');
  assert.equal(control.setManifest({ schema: 'x' }), true);
  assert.equal(control.status().mode, 'manifest-or-rule');
  control.clearManifest();
  assert.equal(control.status().mode, 'shared-rule');
});

test('current public advice projects one caller-resolved board target without owning board semantics', () => {
  let resolverCalls = 0;
  const projection = projectPartnerAdviceBoardEmphasis({
    adviceResult: {
      ok: true,
      containsPrivate: false,
      selected: { candidateId: 'card-a' },
      next: 'card-b',
      source: 'shared-legal-action-core',
    },
    isCurrent: () => true,
    resolveTarget: (candidateId) => {
      resolverCalls += 1;
      assert.equal(candidateId, 'card-a');
      return { targetId: 'battle-target-07' };
    },
  });

  assert.equal(resolverCalls, 1);
  assert.deepEqual(projection, {
    schema: 'gameroad.partner-advice-board-projection.v1',
    active: true,
    clear: false,
    reason: null,
    candidateId: 'card-a',
    targetId: 'battle-target-07',
    alternativeCandidateId: 'card-b',
    source: 'shared-legal-action-core',
    presentationRole: 'partner-recommendation',
    autoExecute: false,
  });
  assert.equal(Object.isFrozen(projection), true);
});

test('private, missing, or failed advice never reaches the board target resolver', () => {
  let resolverCalls = 0;
  const resolveTarget = () => { resolverCalls += 1; return 'should-not-run'; };
  const isCurrent = () => true;

  for (const adviceResult of [
    { ok: false, containsPrivate: false, selected: { candidateId: 'a' } },
    { ok: true, containsPrivate: true, selected: { candidateId: 'a' } },
    { ok: true, selected: { candidateId: 'a' } },
    { ok: true, containsPrivate: false, selected: null },
  ]) {
    const projection = projectPartnerAdviceBoardEmphasis({ adviceResult, isCurrent, resolveTarget });
    assert.equal(projection.active, false);
    assert.equal(projection.clear, true);
    assert.equal(projection.targetId, null);
  }
  assert.equal(resolverCalls, 0);
});

test('stale advice clears presentation before any target resolution', () => {
  let resolverCalls = 0;
  const projection = projectPartnerAdviceBoardEmphasis({
    adviceResult: { ok: true, containsPrivate: false, selected: { candidateId: 'card-a' } },
    isCurrent: () => false,
    resolveTarget: () => { resolverCalls += 1; return 'battle-target-07'; },
  });

  assert.equal(resolverCalls, 0);
  assert.equal(projection.active, false);
  assert.equal(projection.clear, true);
  assert.equal(projection.reason, 'STALE_ADVICE');
});

test('currentness and target resolver failures fail closed with no lingering active target', () => {
  const result = { ok: true, containsPrivate: false, selected: { candidateId: 'card-a' } };

  const currentnessFailure = projectPartnerAdviceBoardEmphasis({
    adviceResult: result,
    isCurrent: () => { throw new Error('stale state provider'); },
    resolveTarget: () => 'battle-target-07',
  });
  assert.equal(currentnessFailure.active, false);
  assert.equal(currentnessFailure.clear, true);
  assert.equal(currentnessFailure.reason, 'CURRENTNESS_CHECK_FAILED');

  const resolverFailure = projectPartnerAdviceBoardEmphasis({
    adviceResult: result,
    isCurrent: () => true,
    resolveTarget: () => { throw new Error('board unavailable'); },
  });
  assert.equal(resolverFailure.active, false);
  assert.equal(resolverFailure.clear, true);
  assert.equal(resolverFailure.reason, 'TARGET_RESOLUTION_FAILED');

  const unmapped = projectPartnerAdviceBoardEmphasis({
    adviceResult: result,
    isCurrent: () => true,
    resolveTarget: () => null,
  });
  assert.equal(unmapped.active, false);
  assert.equal(unmapped.clear, true);
  assert.equal(unmapped.reason, 'TARGET_UNMAPPED');
});

test('projection gate is mandatory and never implies automatic execution', () => {
  const result = { ok: true, containsPrivate: false, selected: { candidateId: 'card-a' } };
  const projection = projectPartnerAdviceBoardEmphasis({ adviceResult: result });
  assert.equal(projection.active, false);
  assert.equal(projection.clear, true);
  assert.equal(projection.reason, 'PROJECTION_GATE_REQUIRED');
  assert.equal(projection.autoExecute, false);
});

test('viewer-safe heuristic Advice becomes character-neutral PartnerResponsePlan v1 input', () => {
  const result = buildPartnerAdviceResponsePlanInput({
    planId: 'advice-plan-1',
    partnerId: 'saasuna',
    sourceUseSite: 'use-site-advice-selection',
    adviceResult: heuristicAdvice(),
    versions: V,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.planInput, {
    schemaVersion: 'gameroad.partner-response-plan.v1',
    planId: 'advice-plan-1',
    partnerId: 'saasuna',
    sourceUseSite: 'use-site-advice-selection',
    purpose: 'ADVISE',
    semantic: {
      intentId: 'partner-advice-recommend-candidate',
      targetId: 'guard',
      alternativeTargetId: 'advance',
      reasonId: 'leftmost',
      confidence: null,
    },
    lineage: {
      evidenceIds: [],
      sourceIds: ['advice-source:shared-legal-action-core'],
      versionRefs: ['rulesVersion=rules-r1', 'cardVersion=cards-r1', 'stateVersion=state-r1'],
    },
    expression: { toneHint: null, emotionHint: null, speechPriority: null },
    safety: {
      safeForCharacterExpression: true,
      containsPrivate: false,
      containsRawUserText: false,
      autoExecute: false,
      automaticCanonMutationAllowed: false,
      automaticRelationshipMutationAllowed: false,
      automaticGameMutationAllowed: false,
      rendererMayChangeSemantic: false,
    },
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.planInput.semantic), true);
});

test('manifest-backed Advice carries aggregate lineage IDs without raw evidence or payload', () => {
  const secret = 'private-transcript-must-not-cross';
  const adviceResult = heuristicAdvice({
    selected: { candidateId: 'guard', payload: { secret } },
    debugText: secret,
    reason: 'APPROVED_RUNTIME_MANIFEST',
    source: 'approved-runtime-manifest',
    manifestUsed: true,
  });
  const result = buildPartnerAdviceResponsePlanInput({
    planId: 'advice-plan-runtime-1',
    partnerId: 'saasuna',
    sourceUseSite: 'use-site-advice-selection',
    adviceResult,
    versions: V,
    runtimeManifest: responsePlanRuntimeManifest(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.planInput.semantic.reasonId, 'approved-runtime-manifest');
  assert.deepEqual(result.planInput.lineage.evidenceIds, []);
  assert.deepEqual(result.planInput.lineage.sourceIds, [
    'advice-source:approved-runtime-manifest',
    'approval:approval-runtime-7',
    'evidence-scope:offline-approved-aggregate-only',
    'decision-product-7',
    'proposal-7',
    'change-ranking-7',
    'cohort-7',
  ]);
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test('manifest-backed Advice fails closed when its manifest carrier is missing', () => {
  const result = buildPartnerAdviceResponsePlanInput({
    planId: 'advice-plan-runtime-missing',
    partnerId: 'saasuna',
    sourceUseSite: 'use-site-advice-selection',
    adviceResult: heuristicAdvice({
      reason: 'APPROVED_RUNTIME_MANIFEST',
      source: 'approved-runtime-manifest',
      manifestUsed: true,
    }),
    versions: V,
  });
  assert.deepEqual(result, { ok: false, reason: 'MANIFEST_LINEAGE_REQUIRED', planInput: null });
});

test('private, stale-version, wrong-use-site, and authority-leaking Advice fail closed', () => {
  const manifestAdvice = heuristicAdvice({
    reason: 'APPROVED_RUNTIME_MANIFEST',
    source: 'approved-runtime-manifest',
    manifestUsed: true,
  });
  const base = {
    planId: 'advice-plan-gates',
    partnerId: 'saasuna',
    sourceUseSite: 'use-site-advice-selection',
    adviceResult: manifestAdvice,
    versions: V,
  };

  assert.equal(buildPartnerAdviceResponsePlanInput({
    ...base,
    adviceResult: heuristicAdvice({ containsPrivate: true }),
  }).reason, 'ADVICE_PRIVACY_BOUNDARY_INVALID');

  assert.equal(buildPartnerAdviceResponsePlanInput({
    ...base,
    runtimeManifest: responsePlanRuntimeManifest({ targetVersions: { ...V, stateVersion: 'state-r2' } }),
  }).reason, 'RUNTIME_MANIFEST_VERSION_MISMATCH');

  assert.equal(buildPartnerAdviceResponsePlanInput({
    ...base,
    runtimeManifest: responsePlanRuntimeManifest({
      collectiveDecisionLineage: {
        ...responsePlanRuntimeManifest().collectiveDecisionLineage,
        consumerUseSiteRef: 'other-use-site',
      },
    }),
  }).reason, 'COLLECTIVE_LINEAGE_USE_SITE_MISMATCH');

  assert.equal(buildPartnerAdviceResponsePlanInput({
    ...base,
    runtimeManifest: responsePlanRuntimeManifest({
      collectiveDecisionLineage: {
        ...responsePlanRuntimeManifest().collectiveDecisionLineage,
        relationshipMutationAllowed: true,
      },
    }),
  }).reason, 'COLLECTIVE_LINEAGE_AUTHORITY_BOUNDARY_INVALID');
});

test('NO_LEGAL_CANDIDATE is an explicit FALLBACK and never invents a target', () => {
  const result = buildPartnerAdviceResponsePlanInput({
    planId: 'advice-plan-fallback',
    partnerId: 'saasuna',
    sourceUseSite: 'use-site-advice-selection',
    adviceResult: heuristicAdvice({ selected: null, next: null, reason: 'NO_LEGAL_CANDIDATE' }),
    versions: V,
  });

  assert.equal(result.ok, true);
  assert.equal(result.planInput.purpose, 'FALLBACK');
  assert.deepEqual(result.planInput.semantic, {
    intentId: 'partner-advice-no-legal-candidate',
    targetId: null,
    alternativeTargetId: null,
    reasonId: 'no-legal-candidate',
    confidence: null,
  });
});
