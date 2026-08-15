import assert from 'node:assert/strict';
import test from 'node:test';
import {
  benchmarkReport,
  deriveAffectiveUxSignals,
  evaluateHoldout,
  eventEligibility,
  promotionDecision,
  recommendAction,
  stateFingerprint,
  trainCollectiveMemory,
} from '../tools/advice-collective-eval.mjs';

const VERSIONS = { rulesVersion: 'rules-r1', cardVersion: 'cards-r1', stateVersion: 'state-r1' };

function state(pressureBand) {
  return { phase: 'battle', turnBand: 'mid', pressureBand, manaBand: 'two-plus', handBand: 'three' };
}

function event(i, pressureBand, actionId, reward, regret = 0, overrides = {}) {
  return {
    eventId: `event-${i}`,
    ...VERSIONS,
    humanGate: 'approved',
    privacyScope: 'shared',
    containsPrivate: false,
    missing: false,
    labelSource: 'benchmark-approved',
    state: state(pressureBand),
    actionId,
    reward,
    regret,
    ...overrides,
  };
}

function deterministicTrainingSet() {
  const rows = [];
  let id = 0;
  for (const pressureBand of ['high', 'low']) {
    const optimal = pressureBand === 'high' ? 'guard' : 'push';
    const other = pressureBand === 'high' ? 'push' : 'guard';
    for (let i = 0; i < 150; i += 1) {
      rows.push(event(id++, pressureBand, optimal, i % 10 === 0 ? 0 : 1, i % 10 === 0 ? 0.2 : 0));
      rows.push(event(id++, pressureBand, other, i % 5 === 0 ? 1 : 0, i % 5 === 0 ? 0 : 0.8));
    }
  }
  return rows;
}

function deterministicHoldout(count = 200) {
  return Array.from({ length: count }, (_, i) => {
    const pressureBand = i % 2 === 0 ? 'high' : 'low';
    const optimalActionId = pressureBand === 'high' ? 'guard' : 'push';
    return {
      state: state(pressureBand),
      optimalActionId,
      regretByAction: optimalActionId === 'guard' ? { guard: 0, push: 0.8 } : { guard: 0.8, push: 0 },
    };
  });
}

test('fingerprint is versioned and stable', () => {
  assert.equal(
    stateFingerprint(state('high'), VERSIONS),
    'rules=rules-r1|cards=cards-r1|state=state-r1|phase=battle|turnBand=mid|pressureBand=high|manaBand=two-plus|handBand=three',
  );
  assert.equal(stateFingerprint({ phase: 'battle' }, VERSIONS), null);
});

test('privacy, approval, missing fields, and version mismatches fail closed', () => {
  const good = event(1, 'high', 'guard', 1);
  assert.equal(eventEligibility(good, VERSIONS).eligible, true);
  assert.equal(eventEligibility({ ...good, humanGate: 'pending' }, VERSIONS).eligible, false);
  assert.equal(eventEligibility({ ...good, containsPrivate: true }, VERSIONS).eligible, false);
  assert.equal(eventEligibility({ ...good, missing: true }, VERSIONS).eligible, false);
  assert.equal(eventEligibility({ ...good, rulesVersion: 'rules-r0' }, VERSIONS).eligible, false);
  assert.equal(eventEligibility({ ...good, labelSource: 'raw-ai-text' }, VERSIONS).eligible, false);
});

test('600 approved battle reflections improve context-aware advice on unseen holdout cases', () => {
  const memory = trainCollectiveMemory(deterministicTrainingSet(), VERSIONS);
  assert.equal(memory.eligibleCount, 600);
  assert.equal(recommendAction(memory, { state: state('high') }).actionId, 'guard');
  assert.equal(recommendAction(memory, { state: state('low') }).actionId, 'push');

  const metrics = evaluateHoldout(memory, deterministicHoldout(200));
  assert.equal(metrics.baselineAccuracy, 0.5);
  assert.equal(metrics.learnedAccuracy, 1);
  assert.equal(metrics.accuracyDelta, 0.5);
  assert.ok(metrics.learnedMeanRegret < metrics.baselineMeanRegret);

  const decision = promotionDecision(memory, metrics);
  assert.equal(decision.promotion, true);
  const report = benchmarkReport(memory, metrics, decision);
  assert.equal(report.livePlayerPerformanceProven, false);
  assert.equal(report.provisional, true);
  console.log(`COLLECTIVE_BENCHMARK ${JSON.stringify(report)}`);
});

test('volume alone cannot promote if holdout improvement is absent', () => {
  const flat = [];
  for (let i = 0; i < 600; i += 1) {
    const pressureBand = i % 2 === 0 ? 'high' : 'low';
    flat.push(event(i, pressureBand, 'guard', 1, 0));
  }
  const memory = trainCollectiveMemory(flat, VERSIONS);
  const allGuardHoldout = deterministicHoldout(200).map((x) => ({ ...x, optimalActionId: 'guard', regretByAction: { guard: 0, push: 0.8 } }));
  const metrics = evaluateHoldout(memory, allGuardHoldout);
  assert.equal(metrics.accuracyDelta, 0);
  const decision = promotionDecision(memory, metrics);
  assert.equal(decision.promotion, false);
  assert.ok(decision.reasons.includes('accuracy-delta-too-small'));
});

test('insufficient support fails promotion even if a tiny sample looks perfect', () => {
  const memory = trainCollectiveMemory(deterministicTrainingSet().slice(0, 20), VERSIONS);
  const metrics = evaluateHoldout(memory, deterministicHoldout(10));
  const decision = promotionDecision(memory, metrics);
  assert.equal(decision.promotion, false);
  assert.ok(decision.reasons.includes('insufficient-train-support'));
  assert.ok(decision.reasons.includes('insufficient-holdout-support'));
});

test('human-like affect is represented only as observable UX proxies', () => {
  const signals = deriveAffectiveUxSignals({
    backtracks: 2,
    hesitationEvents: 1,
    invalidActions: 3,
    retries: 2,
    adviceShown: 10,
    adviceFollowed: 7,
    unexpectedTransitions: 1,
    adviceNegativeOutcome: 2,
  });
  assert.deepEqual(signals, {
    confusionProxy: 3,
    frustrationProxy: 5,
    trustProxy: 0.7,
    surpriseProxy: 1,
    regretProxy: 2 / 7,
    interpretation: 'observable-ux-proxy-not-human-emotion',
    provisional: true,
  });
});
