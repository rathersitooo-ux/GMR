import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EVIDENCE_LINEAGE_BASE_KEYS,
  exactEvidenceToken,
  normalizeEvidenceLineage,
} from '../browser/evidence-lineage-core.mjs';

const base = {
  evidenceId: 'evidence-1',
  sourceId: 'source-1',
  sourceVersion: 'v1',
  provenance: 'server_verified',
  authorityRef: 'authority:1',
  observedAt: '2026-08-29T19:00:00+09:00',
  freshness: 'current',
};

const policy = {
  allowedProvenance: new Set(['server_verified', 'public_production']),
  allowedFreshness: new Set(['current', 'current_bounded']),
};

test('normalizes and freezes the shared seven-field lineage shape', () => {
  const output = normalizeEvidenceLineage(base, policy);
  assert.deepEqual(output, base);
  assert.equal(Object.isFrozen(output), true);
  assert.deepEqual(EVIDENCE_LINEAGE_BASE_KEYS, [
    'evidenceId', 'sourceId', 'sourceVersion', 'provenance', 'authorityRef', 'observedAt', 'freshness',
  ]);
});

test('consumer may allow extra input keys without leaking them into shared lineage', () => {
  const output = normalizeEvidenceLineage({ ...base, counterevidenceState: 'PRESENT' }, {
    ...policy,
    allowedKeys: [...EVIDENCE_LINEAGE_BASE_KEYS, 'counterevidenceState'],
  });
  assert.deepEqual(output, base);
  assert.equal('counterevidenceState' in output, false);
});

test('unexpected keys fail closed under the default shape', () => {
  assert.equal(normalizeEvidenceLineage({ ...base, rawUserText: 'SECRET' }, policy), null);
});

test('provenance and freshness remain caller-owned policy gates', () => {
  assert.equal(normalizeEvidenceLineage({ ...base, provenance: 'fixture' }, policy), null);
  assert.equal(normalizeEvidenceLineage({ ...base, freshness: 'stale' }, policy), null);
  assert.equal(normalizeEvidenceLineage(base, { allowedFreshness: policy.allowedFreshness }), null);
  assert.equal(normalizeEvidenceLineage(base, { allowedProvenance: policy.allowedProvenance }), null);
});

test('required identity fields and exact-token boundaries fail closed', () => {
  for (const key of EVIDENCE_LINEAGE_BASE_KEYS) {
    assert.equal(normalizeEvidenceLineage({ ...base, [key]: '' }, policy), null, key);
  }
  assert.equal(normalizeEvidenceLineage({ ...base, evidenceId: ' evidence-1' }, policy), null);
  assert.equal(normalizeEvidenceLineage({ ...base, sourceId: 'x'.repeat(161) }, policy), null);
  assert.equal(normalizeEvidenceLineage({ ...base, authorityRef: 'x'.repeat(241) }, policy), null);
  assert.equal(normalizeEvidenceLineage({ ...base, observedAt: 'x'.repeat(81) }, policy), null);
});

test('consumer-specific token lengths can preserve an existing contract', () => {
  const output = normalizeEvidenceLineage({
    ...base,
    evidenceId: 'x'.repeat(180),
    observedAt: 'x'.repeat(64),
  }, {
    ...policy,
    tokenMax: 180,
    observedAtMax: 64,
  });
  assert.equal(output.evidenceId.length, 180);
  assert.equal(output.observedAt.length, 64);
});

test('exactEvidenceToken is intentionally shape-only and does not invent timestamp semantics', () => {
  assert.equal(exactEvidenceToken('not-an-rfc3339-timestamp', 80), 'not-an-rfc3339-timestamp');
  assert.equal(exactEvidenceToken(' x', 80), null);
  assert.equal(exactEvidenceToken('x', 0), null);
});
