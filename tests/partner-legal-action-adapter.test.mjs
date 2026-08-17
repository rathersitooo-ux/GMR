import assert from 'node:assert/strict';
import test from 'node:test';
import {
  revalidateSelectedPartnerLegalCandidate,
  selectPartnerLegalCandidate,
  selectPartnerManifestOrRuleCandidate,
} from '../browser/partner-legal-action-adapter.mjs';

const V = Object.freeze({ rulesVersion: 'rules-r1', cardVersion: 'cards-r1', stateVersion: 'state-r1' });
const RUNTIME_STATE = Object.freeze({ phase: 'plan', turnBand: 'early', pressureBand: 'low', manaBand: 'mid', handBand: 'three' });
const RUNTIME_FINGERPRINT = 'rules=rules-r1|cards=cards-r1|state=state-r1|phase=plan|turnBand=early|pressureBand=low|manaBand=mid|handBand=three';

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

function choose(rule, candidates, versions = V) {
  return selectPartnerLegalCandidate({ candidates, rule, sourceVersions: versions, targetVersions: V });
}

function revalidate(selectedCandidateId, rule, candidates, selectedVersions = V, currentVersions = V) {
  return revalidateSelectedPartnerLegalCandidate({
    selectedCandidateId,
    rule,
    selectedVersions,
    candidates,
    currentVersions,
  });
}

function approvedManifest(overrides = {}) {
  return {
    schema: 'gameroad.partner-advice-runtime-manifest.v1',
    targetVersions: { ...V },
    approval: {
      gateId: 'HUMAN-HOLDOUT-ACCEPTANCE',
      approvalId: 'approval-r1',
      humanGate: 'approved',
      privacyScope: 'shared',
    },
    promotionSafe: true,
    defaultActionId: 'heuristic',
    minContextSupport: 8,
    contexts: [{ fingerprint: RUNTIME_FINGERPRINT, actionId: 'learned', support: 12 }],
    sourceEvidence: 'offline-approved-aggregate-only',
    containsRawEvents: false,
    containsPrivate: false,
    livePlayerPerformanceProven: false,
    ...overrides,
  };
}

function chooseWithManifest({ candidates, rule = 'left', manifest = approvedManifest(), runtimeState = RUNTIME_STATE, sourceVersions = V, targetVersions = V } = {}) {
  return selectPartnerManifestOrRuleCandidate({
    candidates,
    rule,
    sourceVersions,
    targetVersions,
    manifest,
    runtimeState,
  });
}

test('left/right use explicit position and ties are candidate-id deterministic', () => {
  const rows = [
    candidate('beta', { positionOrder: 2 }),
    candidate('gamma', { positionOrder: 1 }),
    candidate('alpha', { positionOrder: 1 }),
  ];
  assert.deepEqual(choose('left', rows).ordered, ['alpha', 'gamma', 'beta']);
  assert.equal(choose('left', rows).selected.candidateId, 'alpha');
  assert.deepEqual(choose('right', rows).ordered, ['beta', 'alpha', 'gamma']);
  assert.equal(choose('right', rows).selected.candidateId, 'beta');
});

test('max/min use explicit comparison and deterministic id tie break', () => {
  const rows = [
    candidate('beta', { comparisonValue: 7 }),
    candidate('gamma', { comparisonValue: 3 }),
    candidate('alpha', { comparisonValue: 7 }),
  ];
  assert.deepEqual(choose('max', rows).ordered, ['alpha', 'beta', 'gamma']);
  assert.equal(choose('max', rows).selected.candidateId, 'alpha');
  assert.deepEqual(choose('min', rows).ordered, ['gamma', 'alpha', 'beta']);
  assert.equal(choose('min', rows).selected.candidateId, 'gamma');
});

test('permutation does not change a decision when explicit public facts are unchanged', () => {
  const rows = [
    candidate('c', { positionOrder: 5, comparisonValue: 2 }),
    candidate('a', { positionOrder: 1, comparisonValue: 9 }),
    candidate('b', { positionOrder: 3, comparisonValue: 9 }),
  ];
  const permuted = [rows[2], rows[0], rows[1]];
  for (const rule of ['left', 'right', 'max', 'min']) {
    assert.deepEqual(choose(rule, rows).ordered, choose(rule, permuted).ordered);
    assert.equal(choose(rule, rows).selected.candidateId, choose(rule, permuted).selected.candidateId);
  }
});

test('illegal candidates cannot win and all-illegal returns no selection', () => {
  const result = choose('max', [
    candidate('illegal-high', { legal: false, comparisonValue: 999 }),
    candidate('legal-low', { comparisonValue: 1 }),
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.selected.candidateId, 'legal-low');
  assert.deepEqual(result.ordered, ['legal-low']);

  const none = choose('left', [candidate('x', { legal: false, positionOrder: Number.NaN })]);
  assert.equal(none.ok, true);
  assert.equal(none.selected, null);
  assert.equal(none.reason, 'NO_LEGAL_CANDIDATE');
});

test('duplicate/missing id, hidden scope and asset action fail closed', () => {
  assert.equal(choose('left', [candidate('dup'), candidate('dup')]).error, 'DUPLICATE_OR_MISSING_ID');
  assert.equal(choose('left', [candidate('')]).error, 'DUPLICATE_OR_MISSING_ID');
  assert.equal(choose('left', [candidate('hidden', { publicScope: false })]).error, 'HIDDEN_INFO_BLOCKED');
  assert.equal(choose('left', [candidate('asset', { assetAction: 'PLAY_EFFECT' })]).error, 'ASSET_ACTION_BLOCKED');
});

test('invalid positions/comparisons and unknown rule fail closed', () => {
  assert.equal(choose('left', [candidate('x', { positionOrder: Number.NaN })]).error, 'POSITION_REQUIRED');
  assert.equal(choose('max', [candidate('x', { comparisonValue: null })]).error, 'COMPARISON_VALUE_UNRESOLVED');
  assert.equal(choose('bogus', [candidate('x')]).error, 'UNKNOWN_RULE');
});

test('missing or stale version tuples fail before selection', () => {
  const missing = selectPartnerLegalCandidate({ candidates: [candidate('x')], rule: 'left', sourceVersions: V });
  assert.equal(missing.error, 'VERSION_REQUIRED');
  const stale = choose('left', [candidate('x')], { ...V, stateVersion: 'state-r0' });
  assert.equal(stale.error, 'VERSION_MISMATCH');
});

test('private payload never leaves the adapter and input is unchanged', () => {
  const rows = [candidate('b', { positionOrder: 1 }), candidate('a', { positionOrder: 1 })];
  const before = structuredClone(rows);
  const result = choose('left', rows);
  assert.deepEqual(rows, before);
  assert.equal(result.containsPrivate, false);
  assert.equal(JSON.stringify(result).includes('secret-'), false);
  assert.equal('payload' in result.selected, false);
  assert.deepEqual(Object.keys(result.selected).sort(), ['candidateId', 'comparisonValue', 'kind', 'positionOrder']);
});

test('execution-time revalidation returns the exact previously selected legal candidate', () => {
  const rows = [
    candidate('chosen', { positionOrder: 3, comparisonValue: 4 }),
    candidate('other', { positionOrder: 1, comparisonValue: 9 }),
  ];
  const result = revalidate('chosen', 'max', rows);
  assert.equal(result.ok, true);
  assert.equal(result.selected.candidateId, 'chosen');
  assert.deepEqual(result.versions, V);
});

test('execution-time revalidation never substitutes a different now-preferred legal candidate', () => {
  const rows = [
    candidate('chosen', { comparisonValue: 1 }),
    candidate('now-better', { comparisonValue: 999 }),
  ];
  const result = revalidate('chosen', 'max', rows);
  assert.equal(result.ok, true);
  assert.equal(result.selected.candidateId, 'chosen');
});

test('execution-time revalidation rejects version drift before examining a replacement candidate', () => {
  const current = { ...V, stateVersion: 'state-r2' };
  const result = revalidate('chosen', 'left', [candidate('chosen'), candidate('replacement')], V, current);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'VERSION_MISMATCH');
  assert.equal(result.selected, null);
});

test('execution-time revalidation rejects absent and now-illegal selected ids without substitution', () => {
  const absent = revalidate('chosen', 'left', [candidate('other')]);
  assert.equal(absent.error, 'SELECTED_ID_NOT_FOUND');
  assert.equal(absent.selected, null);

  const illegal = revalidate('chosen', 'left', [
    candidate('chosen', { legal: false }),
    candidate('other', { legal: true }),
  ]);
  assert.equal(illegal.error, 'SELECTED_ID_NOT_LEGAL');
  assert.equal(illegal.selected, null);
});

test('execution-time revalidation preserves hidden, asset and duplicate fail-closed boundaries', () => {
  assert.equal(
    revalidate('chosen', 'left', [candidate('chosen', { publicScope: false })]).error,
    'HIDDEN_INFO_BLOCKED',
  );
  assert.equal(
    revalidate('chosen', 'left', [candidate('chosen', { assetAction: 'PLAY_EFFECT' })]).error,
    'ASSET_ACTION_BLOCKED',
  );
  assert.equal(
    revalidate('chosen', 'left', [candidate('chosen'), candidate('chosen')]).error,
    'DUPLICATE_OR_MISSING_ID',
  );
});

test('execution-time revalidation rejects malformed current candidates', () => {
  assert.equal(
    revalidate('chosen', 'left', [candidate('chosen', { positionOrder: Number.NaN })]).error,
    'POSITION_REQUIRED',
  );
  assert.equal(
    revalidate('chosen', 'max', [candidate('chosen', { comparisonValue: null })]).error,
    'COMPARISON_VALUE_UNRESOLVED',
  );
});

test('execution-time revalidation emits no private payload and does not mutate fresh inputs', () => {
  const rows = [
    candidate('chosen', { positionOrder: 2 }),
    candidate('other', { positionOrder: 1 }),
  ];
  const before = structuredClone(rows);
  const result = revalidate('chosen', 'left', rows);
  assert.deepEqual(rows, before);
  assert.equal(result.containsPrivate, false);
  assert.equal(JSON.stringify(result).includes('secret-'), false);
  assert.equal('payload' in result.selected, false);
  assert.deepEqual(Object.keys(result.selected).sort(), ['candidateId', 'comparisonValue', 'kind', 'positionOrder']);
});

test('approved runtime manifest may replace the heuristic only with a currently legal public candidate', () => {
  const result = chooseWithManifest({
    candidates: [
      candidate('heuristic', { positionOrder: 0 }),
      candidate('learned', { positionOrder: 1 }),
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.manifestUsed, true);
  assert.equal(result.selected.candidateId, 'learned');
  assert.equal(result.reason, 'APPROVED_RUNTIME_MANIFEST');
  assert.equal(result.source, 'approved-runtime-manifest');
  assert.equal(result.manifestSource, 'approved-similar-situation');
  assert.equal(result.manifestSupport, 12);
  assert.equal(result.containsPrivate, false);
  assert.equal(JSON.stringify(result).includes('secret-'), false);
});

test('stale manifest version preserves the exact existing rule heuristic', () => {
  const rows = [candidate('heuristic', { positionOrder: 0 }), candidate('learned', { positionOrder: 1 })];
  const fallback = choose('left', rows);
  const result = chooseWithManifest({
    candidates: rows,
    manifest: approvedManifest({ targetVersions: { ...V, stateVersion: 'state-r0' } }),
  });
  assert.equal(result.manifestUsed, false);
  assert.equal(result.fallbackReason, 'VERSION_MISMATCH');
  assert.equal(result.selected.candidateId, fallback.selected.candidateId);
  assert.deepEqual(result.ordered, fallback.ordered);
  assert.equal(result.reason, fallback.reason);
});

test('private/raw-event manifests preserve the existing heuristic and never expose private payloads', () => {
  const rows = [candidate('heuristic', { positionOrder: 0 }), candidate('learned', { positionOrder: 1 })];
  for (const manifest of [approvedManifest({ containsPrivate: true }), approvedManifest({ containsRawEvents: true })]) {
    const result = chooseWithManifest({ candidates: rows, manifest });
    assert.equal(result.manifestUsed, false);
    assert.equal(result.fallbackReason, 'PRIVACY_NOT_RUNTIME_SAFE');
    assert.equal(result.selected.candidateId, 'heuristic');
    assert.equal(result.containsPrivate, false);
    assert.equal(JSON.stringify(result).includes('secret-'), false);
  }
});

test('manifest action outside the current legal set cannot execute and falls back to the rule heuristic', () => {
  const rows = [
    candidate('heuristic', { positionOrder: 0 }),
    candidate('learned', { positionOrder: 1, legal: false }),
  ];
  const result = chooseWithManifest({ candidates: rows });
  assert.equal(result.manifestUsed, false);
  assert.equal(result.fallbackReason, 'MANIFEST_ACTION_NOT_CURRENTLY_LEGAL');
  assert.equal(result.selected.candidateId, 'heuristic');
});

test('when no legal heuristic exists, rejected manifest does not invent an action', () => {
  const result = chooseWithManifest({
    candidates: [candidate('learned', { legal: false })],
    manifest: approvedManifest({ containsPrivate: true }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.manifestUsed, false);
  assert.equal(result.selected, null);
  assert.deepEqual(result.ordered, []);
  assert.equal(result.reason, 'NO_LEGAL_CANDIDATE');
});
