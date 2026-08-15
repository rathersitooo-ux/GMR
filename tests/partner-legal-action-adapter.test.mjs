import assert from 'node:assert/strict';
import test from 'node:test';
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

function choose(rule, candidates, versions = V) {
  return selectPartnerLegalCandidate({ candidates, rule, sourceVersions: versions, targetVersions: V });
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
