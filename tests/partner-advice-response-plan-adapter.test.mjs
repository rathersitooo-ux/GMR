import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import {
  buildPartnerAdviceResponsePlanInput,
  PARTNER_ADVICE_RESPONSE_PLAN_SCHEMA,
} from '../browser/partner-advice-response-plan-adapter.mjs';

const VERSIONS = Object.freeze({
  rulesVersion: 'rules-r1',
  cardVersion: 'cards-r1',
  stateVersion: 'state-r1',
});

function heuristicAdvice(overrides = {}) {
  return {
    ok: true,
    selected: { candidateId: 'guard', payload: { ignored: true } },
    next: 'advance',
    reason: 'LEFTMOST',
    source: 'shared-legal-action-core',
    containsPrivate: false,
    ...overrides,
  };
}

function runtimeManifest(overrides = {}) {
  return {
    schema: 'gameroad.partner-advice-runtime-manifest.v1',
    targetVersions: { ...VERSIONS },
    approval: {
      gateId: 'HUMAN-HOLDOUT-ACCEPTANCE',
      approvalId: 'approval-runtime-7',
      humanGate: 'approved',
      privacyScope: 'shared',
    },
    promotionSafe: true,
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

function build(overrides = {}) {
  return buildPartnerAdviceResponsePlanInput({
    planId: 'advice-plan-1',
    partnerId: 'saasuna',
    sourceUseSite: 'use-site-advice-selection',
    adviceResult: heuristicAdvice(),
    versions: VERSIONS,
    ...overrides,
  });
}

test('heuristic Advice becomes character-neutral PartnerResponsePlan v1 input', () => {
  const result = build();
  assert.equal(result.ok, true);
  assert.equal(result.reason, null);
  assert.equal(result.planInput.schemaVersion, PARTNER_ADVICE_RESPONSE_PLAN_SCHEMA);
  assert.equal(result.planInput.purpose, 'ADVISE');
  assert.deepEqual(result.planInput.semantic, {
    intentId: 'partner-advice-recommend-candidate',
    targetId: 'guard',
    alternativeTargetId: 'advance',
    reasonId: 'leftmost',
    confidence: null,
  });
  assert.deepEqual(result.planInput.lineage, {
    evidenceIds: [],
    sourceIds: ['advice-source:shared-legal-action-core'],
    versionRefs: ['rulesVersion=rules-r1', 'cardVersion=cards-r1', 'stateVersion=state-r1'],
  });
  assert.deepEqual(result.planInput.expression, {
    toneHint: null,
    emotionHint: null,
    speechPriority: null,
  });
  assert.deepEqual(result.planInput.safety, {
    safeForCharacterExpression: true,
    containsPrivate: false,
    containsRawUserText: false,
    autoExecute: false,
    automaticCanonMutationAllowed: false,
    automaticRelationshipMutationAllowed: false,
    automaticGameMutationAllowed: false,
    rendererMayChangeSemantic: false,
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.planInput.semantic), true);
});

test('approved aggregate runtime lineage is carried as source ids without raw evidence', () => {
  const adviceResult = heuristicAdvice({
    reason: 'APPROVED_RUNTIME_MANIFEST',
    source: 'approved-runtime-manifest',
    manifestUsed: true,
  });
  const result = build({ adviceResult, runtimeManifest: runtimeManifest() });
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
});

test('manifest-backed Advice fails closed when its lineage carrier is missing', () => {
  const result = build({
    adviceResult: heuristicAdvice({
      reason: 'APPROVED_RUNTIME_MANIFEST',
      source: 'approved-runtime-manifest',
      manifestUsed: true,
    }),
  });
  assert.deepEqual(result, { ok: false, reason: 'MANIFEST_LINEAGE_REQUIRED', planInput: null });
});

test('private, stale-version, wrong-use-site, or authority-leaking manifests are rejected', () => {
  assert.equal(build({ adviceResult: heuristicAdvice({ containsPrivate: true }) }).reason, 'ADVICE_PRIVACY_BOUNDARY_INVALID');

  const privateManifest = runtimeManifest({ containsPrivate: true });
  assert.equal(build({
    adviceResult: heuristicAdvice({ manifestUsed: true, reason: 'APPROVED_RUNTIME_MANIFEST', source: 'approved-runtime-manifest' }),
    runtimeManifest: privateManifest,
  }).reason, 'RUNTIME_MANIFEST_PRIVACY_BOUNDARY_INVALID');

  const wrongVersion = runtimeManifest({ targetVersions: { ...VERSIONS, stateVersion: 'state-r2' } });
  assert.equal(build({
    adviceResult: heuristicAdvice({ manifestUsed: true, reason: 'APPROVED_RUNTIME_MANIFEST', source: 'approved-runtime-manifest' }),
    runtimeManifest: wrongVersion,
  }).reason, 'RUNTIME_MANIFEST_VERSION_MISMATCH');

  const wrongUseSite = runtimeManifest({
    collectiveDecisionLineage: {
      ...runtimeManifest().collectiveDecisionLineage,
      consumerUseSiteRef: 'other-use-site',
    },
  });
  assert.equal(build({
    adviceResult: heuristicAdvice({ manifestUsed: true, reason: 'APPROVED_RUNTIME_MANIFEST', source: 'approved-runtime-manifest' }),
    runtimeManifest: wrongUseSite,
  }).reason, 'COLLECTIVE_LINEAGE_USE_SITE_MISMATCH');

  const authorityLeak = runtimeManifest({
    collectiveDecisionLineage: {
      ...runtimeManifest().collectiveDecisionLineage,
      relationshipMutationAllowed: true,
    },
  });
  assert.equal(build({
    adviceResult: heuristicAdvice({ manifestUsed: true, reason: 'APPROVED_RUNTIME_MANIFEST', source: 'approved-runtime-manifest' }),
    runtimeManifest: authorityLeak,
  }).reason, 'COLLECTIVE_LINEAGE_AUTHORITY_BOUNDARY_INVALID');
});

test('NO_LEGAL_CANDIDATE becomes explicit FALLBACK instead of inventing a target', () => {
  const result = build({
    adviceResult: heuristicAdvice({
      selected: null,
      next: null,
      reason: 'NO_LEGAL_CANDIDATE',
    }),
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

test('raw candidate payload and free text are never copied into the response-plan input', () => {
  const secret = 'private transcript text that must not cross the boundary';
  const result = build({
    adviceResult: heuristicAdvice({
      selected: { candidateId: 'guard', payload: { secret, prose: secret } },
      debugText: secret,
    }),
  });
  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test('when Window1 core is present, emitted input validates with the shared builder', async (t) => {
  const coreUrl = new URL('../browser/partner-response-plan-core.mjs', import.meta.url);
  if (!existsSync(coreUrl)) {
    t.skip('Window1 response-plan core is not merged into this branch yet');
    return;
  }
  const { buildPartnerResponsePlan } = await import(coreUrl.href);
  const result = build();
  assert.equal(result.ok, true);
  assert.equal(buildPartnerResponsePlan(result.planInput).ok, true);
});
