import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateCardUsage,
  projectCardUsageForCard,
  CARD_USAGE_TIER_CORE,
} from '../browser/card-usage-tier-core.mjs';

const versions = Object.freeze({ rulesVersion: 'rules-r1', cardVersion: 'cards-r1' });
const query = Object.freeze({
  versions,
  mode: 'ranked-2v2',
  role: 'road',
  cohort: 'rank-band-a',
  zone: 'main',
  period: {
    startInclusive: '2026-09-01T00:00:00+09:00',
    endExclusive: '2026-10-01T00:00:00+09:00',
  },
});

function snapshot(main, ex = []) {
  return {
    schema: CARD_USAGE_TIER_CORE.matchStartSchema,
    deck: { main, ex, ruleId: 'deck-rule', ruleRevision: 1 },
    setup: { mode: 'ranked-2v2', content: 'standard' },
    selection: { playerCharacterId: 'character-a', selectedPartnerId: 'partner-a' },
  };
}

function sample(sampleKey, main, overrides = {}) {
  return {
    sampleKey,
    matchStartAccepted: true,
    versions,
    role: 'road',
    cohort: 'rank-band-a',
    capturedAt: '2026-09-08T07:00:00+09:00',
    snapshot: snapshot(main),
    ...overrides,
  };
}

const explicitPolicy = Object.freeze({
  minimumDecks: 4,
  minimumRate: Object.freeze({ S: 0.75, A: 0.5, B: 0.25, C: 0.1, D: 0 }),
});

test('counts card presence once per eligible deck instead of counting copies', () => {
  const result = aggregateCardUsage([
    sample('s1', ['CARD_A', 'CARD_A', 'CARD_B']),
    sample('s2', ['CARD_A', 'CARD_C']),
    sample('s3', ['CARD_B']),
    sample('s4', ['CARD_A']),
  ], query);

  assert.equal(result.eligibleDecks, 4);
  assert.deepEqual(result.cards.CARD_A, { decksWithCard: 3, adoptionRate: 0.75 });
  assert.deepEqual(result.cards.CARD_B, { decksWithCard: 2, adoptionRate: 0.5 });
  assert.deepEqual(result.cards.CARD_C, { decksWithCard: 1, adoptionRate: 0.25 });
  assert.equal(result.sampleIdentityRetained, false);
  assert.equal(result.rawDecksRetained, false);
  assert.equal(result.strengthSignal, false);
  assert.equal(result.optimalActionSignal, false);
});

test('fails closed across version, role, cohort, mode, period and accepted-source boundaries', () => {
  const result = aggregateCardUsage([
    sample('ok', ['CARD_A']),
    sample('version', ['CARD_A'], { versions: { rulesVersion: 'rules-old', cardVersion: 'cards-r1' } }),
    sample('role', ['CARD_A'], { role: 'support' }),
    sample('cohort', ['CARD_A'], { cohort: 'rank-band-b' }),
    sample('mode', ['CARD_A'], { snapshot: { ...snapshot(['CARD_A']), setup: { mode: 'casual', content: 'standard' } } }),
    sample('period', ['CARD_A'], { capturedAt: '2026-10-01T00:00:00+09:00' }),
    sample('unaccepted', ['CARD_A'], { matchStartAccepted: false }),
  ], query);

  assert.equal(result.eligibleDecks, 1);
  assert.equal(result.cards.CARD_A.decksWithCard, 1);
  assert.deepEqual(result.rejected, {
    'cohort-mismatch': 1,
    'match-start-not-accepted': 1,
    'mode-mismatch': 1,
    'period-mismatch': 1,
    'role-mismatch': 1,
    'version-mismatch': 1,
  });
});

test('deduplicates the opaque sample identity before contributing to the denominator', () => {
  const result = aggregateCardUsage([
    sample('same-sample', ['CARD_A']),
    sample('same-sample', ['CARD_B']),
  ], query);

  assert.equal(result.eligibleDecks, 1);
  assert.deepEqual(result.cards.CARD_A, { decksWithCard: 1, adoptionRate: 1 });
  assert.equal(result.cards.CARD_B, undefined);
  assert.equal(result.rejected['duplicate-sample-key'], 1);
});

test('keeps main and EX adoption denominators explicit instead of merging zones implicitly', () => {
  const records = [
    sample('s1', ['MAIN_A'], { snapshot: snapshot(['MAIN_A'], ['EX_A']) }),
    sample('s2', ['MAIN_B'], { snapshot: snapshot(['MAIN_B'], ['EX_A', 'EX_B']) }),
  ];
  const exAggregate = aggregateCardUsage(records, { ...query, zone: 'ex' });
  const anyAggregate = aggregateCardUsage(records, { ...query, zone: 'any' });

  assert.equal(exAggregate.cards.EX_A.adoptionRate, 1);
  assert.equal(exAggregate.cards.MAIN_A, undefined);
  assert.equal(anyAggregate.cards.EX_A.adoptionRate, 1);
  assert.equal(anyAggregate.cards.MAIN_A.adoptionRate, 0.5);
});

test('does not invent a Tier when support and threshold policy are absent', () => {
  const aggregate = aggregateCardUsage([
    sample('s1', ['CARD_A']),
    sample('s2', ['CARD_A']),
    sample('s3', ['CARD_B']),
  ], query);
  const view = projectCardUsageForCard(aggregate, 'CARD_A');

  assert.equal(view.glance.label, '採用 未確定');
  assert.equal(view.glance.tier, null);
  assert.equal(view.glance.status, 'POLICY_UNAVAILABLE');
  assert.equal(view.glance.rawPercentPrimary, false);
  assert.equal(view.detail.performance.status, 'SEPARATE_PIPELINE');
  assert.equal(view.strengthSignal, false);
});

test('shows sample insufficiency visibly instead of assigning a low-confidence Tier', () => {
  const aggregate = aggregateCardUsage([
    sample('s1', ['CARD_A']),
    sample('s2', ['CARD_A']),
    sample('s3', ['CARD_A']),
  ], query);
  const view = projectCardUsageForCard(aggregate, 'CARD_A', explicitPolicy);

  assert.equal(view.glance.label, '採用 集計不足');
  assert.equal(view.glance.tier, null);
  assert.equal(view.glance.status, 'INSUFFICIENT_SAMPLE');
  assert.equal(view.detail.adoption.eligibleDecks, 3);
});

test('assigns S/A/B/C/D only from an explicit external threshold policy', () => {
  const aggregate = aggregateCardUsage([
    sample('s1', ['S_CARD', 'A_CARD', 'B_CARD', 'C_CARD', 'D_CARD']),
    sample('s2', ['S_CARD', 'A_CARD', 'B_CARD']),
    sample('s3', ['S_CARD', 'A_CARD']),
    sample('s4', ['S_CARD']),
  ], query);

  assert.equal(projectCardUsageForCard(aggregate, 'S_CARD', explicitPolicy).glance.label, '採用 S');
  assert.equal(projectCardUsageForCard(aggregate, 'A_CARD', explicitPolicy).glance.label, '採用 S');
  assert.equal(projectCardUsageForCard(aggregate, 'B_CARD', explicitPolicy).glance.label, '採用 A');
  assert.equal(projectCardUsageForCard(aggregate, 'C_CARD', explicitPolicy).glance.label, '採用 B');
  assert.equal(projectCardUsageForCard(aggregate, 'MISSING_CARD', explicitPolicy).glance.label, '採用 D');
});

test('viewer projection exposes drill-down evidence but no raw deck or sample identity', () => {
  const aggregate = aggregateCardUsage([
    sample('private-sample-1', ['CARD_A', 'SECRET_DECK_CARD']),
    sample('private-sample-2', ['CARD_A']),
    sample('private-sample-3', ['CARD_A']),
    sample('private-sample-4', ['CARD_A']),
  ], query);
  const view = projectCardUsageForCard(aggregate, 'CARD_A', explicitPolicy);
  const serialized = JSON.stringify(view);

  assert.equal(view.glance.label, '採用 S');
  assert.equal(view.detail.adoption.adoptionRate, 1);
  assert.equal(view.detail.adoption.decksWithCard, 4);
  assert.deepEqual(view.evidence.versions, versions);
  assert.deepEqual(view.evidence.period, query.period);
  assert.equal(view.glance.colorOnly, false);
  assert.equal(view.containsRawDecks, false);
  assert.equal(view.containsSampleIdentity, false);
  assert.equal(serialized.includes('private-sample-1'), false);
  assert.equal(serialized.includes('SECRET_DECK_CARD'), false);
});

test('invalid tier policy remains unrated instead of silently falling back to invented defaults', () => {
  const aggregate = aggregateCardUsage([
    sample('s1', ['CARD_A']),
    sample('s2', ['CARD_A']),
    sample('s3', ['CARD_A']),
    sample('s4', ['CARD_A']),
  ], query);
  const badPolicy = {
    minimumDecks: 1,
    minimumRate: { S: 0.5, A: 0.6, B: 0.2, C: 0.1, D: 0 },
  };
  const view = projectCardUsageForCard(aggregate, 'CARD_A', badPolicy);

  assert.equal(view.glance.status, 'POLICY_UNAVAILABLE');
  assert.equal(view.glance.tier, null);
  assert.equal(view.glance.label, '採用 未確定');
});

test('query is mandatory and exact rather than defaulting cohort or role', () => {
  assert.throws(
    () => aggregateCardUsage([sample('s1', ['CARD_A'])], { ...query, role: undefined }),
    /CARD_USAGE_QUERY_INVALID/,
  );
  assert.throws(
    () => aggregateCardUsage([sample('s1', ['CARD_A'])], { ...query, period: null }),
    /CARD_USAGE_QUERY_INVALID/,
  );
});
