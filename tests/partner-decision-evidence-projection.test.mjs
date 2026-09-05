import assert from 'node:assert/strict';
import test from 'node:test';
import { projectPartnerDecisionEvidence, PARTNER_DECISION_EVIDENCE_CONTRACT } from '../browser/partner-decision-evidence-projection.mjs';
import { selectPartnerLegalCandidate } from '../browser/partner-legal-action-adapter.mjs';

const V = Object.freeze({ rulesVersion: 'rules-r1', cardVersion: 'cards-r1', stateVersion: 'state-r1' });

function candidate(candidateId, overrides = {}) {
  return {
    candidateId,
    kind: 'card',
    positionOrder: 0,
    comparisonValue: 0,
    legal: true,
    publicScope: true,
    assetAction: 'NONE',
    payload: { privateOpaque: `secret-${candidateId}` },
    ...overrides,
  };
}

function decide(rule, candidates, versions = V) {
  return selectPartnerLegalCandidate({ candidates, rule, sourceVersions: versions, targetVersions: V });
}

function project({ candidates, rule = 'left', decisionResult = decide(rule, candidates), sourceVersions = V, targetVersions = V } = {}) {
  return projectPartnerDecisionEvidence({ candidates, rule, decisionResult, sourceVersions, targetVersions });
}

test('projects exact current legal public candidates and selected action without private payload', () => {
  const candidates = [
    candidate('beta', { positionOrder: 2, comparisonValue: 4 }),
    candidate('illegal', { positionOrder: 0, comparisonValue: 99, legal: false }),
    candidate('alpha', { positionOrder: 1, comparisonValue: 7 }),
  ];
  const before = structuredClone(candidates);
  const result = project({ candidates, rule: 'left' });

  assert.equal(result.ok, true);
  assert.deepEqual(candidates, before);
  assert.deepEqual(result.evidence.versions, V);
  assert.equal(result.evidence.selection.candidateId, 'alpha');
  assert.equal(result.evidence.selection.source, 'shared-legal-action-core');
  assert.equal(result.evidence.selection.reason, 'LEFTMOST');
  assert.deepEqual(result.evidence.legalCandidateIds, ['alpha', 'beta']);
  assert.deepEqual(result.evidence.legalCandidates, [
    { candidateId: 'alpha', kind: 'card', positionOrder: 1, comparisonValue: 7 },
    { candidateId: 'beta', kind: 'card', positionOrder: 2, comparisonValue: 4 },
  ]);
  assert.equal(result.evidence.legalCandidateCount, 2);
  assert.equal(result.evidence.containsPrivate, false);
  assert.equal(result.evidence.outcomeAttached, false);
  assert.equal(result.evidence.rewardAttached, false);
  assert.equal(result.evidence.gameplayAuthoritative, false);
  assert.equal(result.evidence.bestMoveProven, false);
  assert.equal(JSON.stringify(result).includes('secret-'), false);
});

test('projection is deterministic across candidate input permutations', () => {
  const rows = [
    candidate('c', { positionOrder: 3, comparisonValue: 2 }),
    candidate('a', { positionOrder: 1, comparisonValue: 9 }),
    candidate('b', { positionOrder: 2, comparisonValue: 5 }),
  ];
  const first = project({ candidates: rows, rule: 'max', decisionResult: decide('max', rows) });
  const permuted = [rows[2], rows[0], rows[1]];
  const second = project({ candidates: permuted, rule: 'max', decisionResult: decide('max', permuted) });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(first.evidence, second.evidence);
});

test('selected action is revalidated and cannot be projected after it becomes illegal', () => {
  const before = [candidate('chosen', { positionOrder: 0 }), candidate('other', { positionOrder: 1 })];
  const decisionResult = decide('left', before);
  const current = [candidate('chosen', { positionOrder: 0, legal: false }), candidate('other', { positionOrder: 1 })];
  const result = project({ candidates: current, rule: 'left', decisionResult });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'SELECTED_ACTION_SELECTED_ID_NOT_LEGAL');
  assert.equal(result.evidence, null);
});

test('hidden, asset-mutating, duplicate and malformed candidate boundaries fail closed', () => {
  const cases = [
    [candidate('a'), candidate('hidden', { publicScope: false })],
    [candidate('a'), candidate('asset', { assetAction: 'PLAY_EFFECT' })],
    [candidate('a'), candidate('a')],
    [candidate('a'), candidate('', { legal: false })],
  ];

  for (const candidates of cases) {
    const decisionResult = { ok: true, containsPrivate: false, selected: { candidateId: 'a' }, source: 'shared-legal-action-core', reason: 'LEFTMOST' };
    const result = project({ candidates, rule: 'left', decisionResult });
    assert.equal(result.ok, false);
    assert.equal(result.evidence, null);
    assert.equal(result.containsPrivate, false);
  }
});

test('version drift fails before any decision evidence is emitted', () => {
  const candidates = [candidate('a')];
  const decisionResult = decide('left', candidates);
  const result = project({
    candidates,
    rule: 'left',
    decisionResult,
    sourceVersions: V,
    targetVersions: { ...V, stateVersion: 'state-r2' },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'VERSION_MISMATCH');
  assert.equal(result.evidence, null);
});

test('unverified/private decision result and unknown source are rejected', () => {
  const candidates = [candidate('a')];
  const decisionResult = decide('left', candidates);

  assert.equal(project({ candidates, decisionResult: { ...decisionResult, containsPrivate: true } }).reason, 'DECISION_PRIVACY_UNVERIFIED');
  assert.equal(project({ candidates, decisionResult: { ...decisionResult, source: 'client-claimed-best' } }).reason, 'SELECTION_PROVENANCE_INVALID');
  assert.equal(project({ candidates, decisionResult: { ok: false, containsPrivate: false } }).reason, 'DECISION_NOT_READY');
});

test('approved runtime-manifest provenance can be recorded but still carries no best-move authority', () => {
  const candidates = [candidate('a'), candidate('b', { positionOrder: 1 })];
  const heuristic = decide('left', candidates);
  const decisionResult = {
    ...heuristic,
    source: 'approved-runtime-manifest',
    reason: 'APPROVED_RUNTIME_MANIFEST',
    manifestUsed: true,
    manifestSource: 'approved-similar-situation',
    manifestSupport: 12,
  };
  const result = project({ candidates, rule: 'left', decisionResult });
  assert.equal(result.ok, true);
  assert.deepEqual(result.evidence.selection.manifest, { source: 'approved-similar-situation', support: 12 });
  assert.equal(result.evidence.bestMoveProven, false);
  assert.equal(result.evidence.gameplayAuthoritative, false);
});

test('contract explicitly delegates legality and refuses storage/outcome/reward authority', () => {
  assert.equal(PARTNER_DECISION_EVIDENCE_CONTRACT.legalityAuthority.includes('revalidateSelectedPartnerLegalCandidate'), true);
  assert.equal(PARTNER_DECISION_EVIDENCE_CONTRACT.storageAuthority, 'NONE');
  assert.equal(PARTNER_DECISION_EVIDENCE_CONTRACT.outcomeAuthority, 'NONE');
  assert.equal(PARTNER_DECISION_EVIDENCE_CONTRACT.rewardPolicy, 'NO_REWARD_DERIVATION_IN_DECISION_PROJECTION');
  assert.equal(PARTNER_DECISION_EVIDENCE_CONTRACT.bestMovePolicy.includes('UNPROVEN'), true);
});
