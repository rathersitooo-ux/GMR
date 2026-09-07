import assert from 'node:assert/strict';
import test from 'node:test';
import { promotionDecision } from '../tools/advice-collective-eval.mjs';
import {
  buildCollectiveContextSubsetIndex,
  compileCollectiveContextSubsetManifest,
  contextSubsetFingerprint,
  normalizeContextBackoffPlan,
  recommendFromCollectiveContextSubsetManifest,
} from '../tools/advice-context-subset-index.mjs';

const VERSIONS = { rulesVersion: 'rules-r1', cardVersion: 'cards-r1', stateVersion: 'state-r1' };

function battleState(pressureBand, index = 0, overrides = {}) {
  return {
    phase: 'battle',
    turnBand: `turn-${index % 4}`,
    pressureBand,
    manaBand: `mana-${index % 3}`,
    handBand: `hand-${index % 5}`,
    ...overrides,
  };
}

function approvedEvent(index, pressureBand, actionId, overrides = {}) {
  return {
    eventId: `event-${index}`,
    ...VERSIONS,
    humanGate: 'approved',
    privacyScope: 'shared',
    containsPrivate: false,
    missing: false,
    labelSource: 'benchmark-approved',
    state: battleState(pressureBand, index),
    actionId,
    reward: 1,
    regret: 0,
    ...overrides,
  };
}

function trainingRows() {
  const rows = [];
  for (let i = 0; i < 24; i += 1) rows.push(approvedEvent(i, 'high', 'guard'));
  for (let i = 24; i < 48; i += 1) rows.push(approvedEvent(i, 'low', 'push'));
  return rows;
}

function approvedGate(overrides = {}) {
  return {
    gateId: 'HUMAN-HOLDOUT-ACCEPTANCE',
    approvalId: 'context-index-human-001',
    humanGate: 'approved',
    privacyScope: 'shared',
    containsPrivate: false,
    ...VERSIONS,
    ...overrides,
  };
}

function promotableDecision(memory) {
  return promotionDecision(
    memory,
    { total: 1, accuracyDelta: 0, regretDelta: 0 },
    { minTrainEvents: 1, minHoldoutCases: 1, minAccuracyDelta: 0, maxRegretDelta: 0 },
  );
}

test('backoff plan is caller-owned, canonical, and rejects duplicate or unknown dimensions', () => {
  assert.deepEqual(
    normalizeContextBackoffPlan([
      ['pressureBand', 'phase'],
      ['phase'],
    ]),
    [
      ['phase', 'pressureBand'],
      ['phase'],
    ],
  );
  assert.equal(normalizeContextBackoffPlan([['phase'], ['phase']]), null);
  assert.equal(normalizeContextBackoffPlan([['phase', 'unknownBand']]), null);
  assert.equal(normalizeContextBackoffPlan([]), null);
});

test('subset fingerprint ignores non-selected dimensions without losing required state validation', () => {
  const first = battleState('high', 1);
  const second = battleState('high', 19);
  assert.equal(
    contextSubsetFingerprint(first, ['phase', 'pressureBand']),
    contextSubsetFingerprint(second, ['pressureBand', 'phase']),
  );
  assert.notEqual(
    contextSubsetFingerprint(first, ['phase', 'turnBand']),
    contextSubsetFingerprint(second, ['phase', 'turnBand']),
  );
  assert.equal(contextSubsetFingerprint({ phase: 'battle' }, ['phase']), null);
});

test('approved events build aggregate-only subset buckets and never retain raw log identities', () => {
  const rows = [
    ...trainingRows(),
    approvedEvent(100, 'high', 'guard', { humanGate: 'pending' }),
    approvedEvent(101, 'high', 'guard', { containsPrivate: true }),
    approvedEvent(102, 'high', 'guard', { cardVersion: 'cards-r0' }),
  ];
  const index = buildCollectiveContextSubsetIndex(rows, VERSIONS, {
    backoffPlan: [['phase', 'pressureBand'], ['phase']],
  });

  assert.equal(index.eligibleCount, 48);
  assert.equal(index.containsRawEvents, false);
  assert.equal(index.containsPrivate, false);
  assert.equal(index.secondDatabaseCreated, false);
  assert.equal(index.secondRecorderCreated, false);
  assert.equal(index.secondRankerCreated, false);
  assert.equal(index.rankingAuthority, 'tools/advice-collective-eval.mjs');
  assert.equal(index.strategyOwnedByCaller, true);
  assert.equal(index.rawLogScanAtRecommendation, false);
  assert.equal(index.maxRuntimeLookups, 2);
  assert.equal('events' in index, false);

  const pressureLevel = index.levels.get('phase,pressureBand');
  assert.equal(pressureLevel.buckets.size, 2);
  assert.deepEqual([...pressureLevel.buckets.values()].map((bucket) => bucket.support).sort((a, b) => a - b), [24, 24]);
});

test('Human-approved manifest uses bounded context backoff before global fallback', () => {
  const index = buildCollectiveContextSubsetIndex(trainingRows(), VERSIONS, {
    backoffPlan: [['phase', 'pressureBand'], ['phase']],
  });
  const decision = promotableDecision(index.baseMemory);
  assert.equal(decision.promotion, true);

  const compiled = compileCollectiveContextSubsetManifest(index, decision, approvedGate(), { minContextSupport: 8 });
  assert.equal(compiled.ok, true);
  assert.equal(compiled.manifest.runtimeLookupMode, 'constant-time-indexed-per-level');
  assert.equal(compiled.manifest.rawLogScanAtRecommendation, false);
  assert.equal(compiled.manifest.maxRuntimeLookups, 2);
  assert.equal(compiled.manifest.strategyOwnedByCaller, true);
  assert.equal(compiled.manifest.optimalActionProven, false);

  const high = recommendFromCollectiveContextSubsetManifest(
    compiled.manifest,
    battleState('high', 99),
    VERSIONS,
  );
  const low = recommendFromCollectiveContextSubsetManifest(
    compiled.manifest,
    battleState('low', 98),
    VERSIONS,
  );
  const outside = recommendFromCollectiveContextSubsetManifest(
    compiled.manifest,
    battleState('medium', 97, { phase: 'setup' }),
    VERSIONS,
  );

  assert.equal(high.actionId, 'guard');
  assert.equal(high.source, 'approved-context-subset');
  assert.deepEqual(high.contextKeys, ['phase', 'pressureBand']);
  assert.equal(high.support, 24);

  assert.equal(low.actionId, 'push');
  assert.equal(low.source, 'approved-context-subset');
  assert.deepEqual(low.contextKeys, ['phase', 'pressureBand']);
  assert.equal(low.support, 24);

  assert.equal(outside.source, 'approved-global-fallback');
  assert.equal(outside.actionId, compiled.manifest.baseManifest.defaultActionId);

  const serialized = JSON.stringify(compiled.manifest);
  assert.equal(serialized.includes('event-'), false);
  assert.equal(serialized.includes('rewardSum'), false);
  assert.equal(serialized.includes('regretSum'), false);
});

test('support, Human approval, and version boundaries fail closed', () => {
  const index = buildCollectiveContextSubsetIndex(trainingRows(), VERSIONS, {
    backoffPlan: [['phase', 'pressureBand']],
  });
  const decision = promotableDecision(index.baseMemory);

  assert.equal(
    compileCollectiveContextSubsetManifest(index, decision, approvedGate({ humanGate: 'pending' }), { minContextSupport: 8 }).reason,
    'human-gate-not-approved',
  );

  const compiled = compileCollectiveContextSubsetManifest(index, decision, approvedGate(), { minContextSupport: 30 });
  assert.equal(compiled.ok, true);
  const low = recommendFromCollectiveContextSubsetManifest(compiled.manifest, battleState('low', 200), VERSIONS);
  assert.equal(low.source, 'approved-global-fallback');

  const stale = recommendFromCollectiveContextSubsetManifest(
    compiled.manifest,
    battleState('high', 201),
    { ...VERSIONS, stateVersion: 'state-r0' },
  );
  assert.equal(stale.actionId, null);
  assert.equal(stale.reason, 'version-mismatch');
});
