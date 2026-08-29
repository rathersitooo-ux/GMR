import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DAILY_TOUR_MODES,
  advanceDailyTour,
  createDailyTourPlan,
  getNextDailyTourStop,
  summarizeDailyTour,
} from '../browser/daily-tour-core.mjs';

const STOPS = [
  { id: 'brain', registered: true, eligible: true },
  { id: 'fossil', registered: true, eligible: true },
  { id: 'tea', registered: true, eligible: true },
];

test('recommended route respects preference then retains remaining eligible registered stops', () => {
  const plan = createDailyTourPlan({
    dayKey: '2026-08-29',
    stops: STOPS,
    recommendationOrder: ['fossil'],
  });
  assert.deepEqual(plan.route.map((stop) => stop.id), ['fossil', 'brain', 'tea']);
});

test('ineligible and unregistered stops are excluded fail-closed', () => {
  const plan = createDailyTourPlan({
    dayKey: '2026-08-29',
    stops: [
      { id: 'ok' },
      { id: 'disabled', enabled: false },
      { id: 'ineligible', eligible: false },
      { id: 'unregistered', registered: false },
      { nope: 'unknown' },
    ],
  });
  assert.deepEqual(plan.route.map((stop) => stop.id), ['ok']);
});

test('explicit registeredStopIds preserves user preference order', () => {
  const plan = createDailyTourPlan({
    dayKey: '2026-08-29',
    stops: STOPS,
    registeredStopIds: ['tea', 'brain'],
  });
  assert.deepEqual(plan.route.map((stop) => stop.id), ['tea', 'brain']);
});

test('recommendation priority does not destroy remaining registered preference order', () => {
  const plan = createDailyTourPlan({
    dayKey: '2026-08-29',
    stops: STOPS,
    registeredStopIds: ['tea', 'fossil', 'brain'],
    recommendationOrder: ['fossil'],
  });
  assert.deepEqual(plan.route.map((stop) => stop.id), ['fossil', 'tea', 'brain']);
});

test('custom route respects explicit user order and ignores unknown entries', () => {
  const plan = createDailyTourPlan({
    dayKey: '2026-08-29',
    mode: DAILY_TOUR_MODES.CUSTOM,
    stops: STOPS,
    customOrder: ['tea', 'missing', 'brain'],
  });
  assert.deepEqual(plan.route.map((stop) => stop.id), ['tea', 'brain']);
});

test('custom route falls back to registered order when no custom order exists', () => {
  const plan = createDailyTourPlan({
    dayKey: '2026-08-29',
    mode: 'custom',
    stops: STOPS,
    registeredStopIds: ['tea', 'brain', 'fossil'],
  });
  assert.deepEqual(plan.route.map((stop) => stop.id), ['tea', 'brain', 'fossil']);
});

test('background stops never block the interactive route', () => {
  const plan = createDailyTourPlan({
    dayKey: '2026-08-29',
    stops: [{ id: 'mission-progress', kind: 'background' }, { id: 'fossil' }],
  });
  assert.deepEqual(plan.route.map((stop) => stop.id), ['fossil']);
});

test('skip is allowed and never creates missed-day debt', () => {
  let plan = createDailyTourPlan({ dayKey: '2026-08-29', stops: STOPS, includeBattleFinale: false });
  plan = advanceDailyTour(plan, { type: 'skip_stop', stopId: 'brain' });
  const summary = summarizeDailyTour(plan);
  assert.equal(plan.route[0].status, 'skipped');
  assert.equal(summary.hasDebt, false);
});

test('one completed stop is meaningful participation without requiring full completion', () => {
  let plan = createDailyTourPlan({ dayKey: '2026-08-29', stops: STOPS });
  plan = advanceDailyTour(plan, { type: 'complete_stop', stopId: 'brain' });
  const summary = summarizeDailyTour(plan);
  assert.equal(summary.meaningfulDailyParticipation, true);
  assert.equal(summary.pendingStopCount, 2);
});

test('repeated completion is idempotent', () => {
  const original = createDailyTourPlan({ dayKey: '2026-08-29', stops: STOPS });
  const once = advanceDailyTour(original, { type: 'complete_stop', stopId: 'brain' });
  const twice = advanceDailyTour(once, { type: 'complete_stop', stopId: 'brain' });
  assert.strictEqual(twice, once);
  assert.equal(summarizeDailyTour(twice).completedStopCount, 1);
});

test('interruption hides next action and resume restores it without losing progress', () => {
  let plan = createDailyTourPlan({ dayKey: '2026-08-29', stops: STOPS });
  plan = advanceDailyTour(plan, { type: 'complete_stop', stopId: 'brain' });
  plan = advanceDailyTour(plan, { type: 'interrupt' });
  assert.equal(getNextDailyTourStop(plan), null);
  plan = advanceDailyTour(plan, { type: 'resume' });
  assert.deepEqual(getNextDailyTourStop(plan), { id: 'fossil', type: 'daily_stop' });
  assert.equal(summarizeDailyTour(plan).completedStopCount, 1);
});

test('battle finale is optional and is presented only after Daily stops settle', () => {
  let plan = createDailyTourPlan({ dayKey: '2026-08-29', stops: [{ id: 'brain' }] });
  assert.deepEqual(getNextDailyTourStop(plan), { id: 'brain', type: 'daily_stop' });
  plan = advanceDailyTour(plan, { type: 'skip_stop', stopId: 'brain' });
  assert.deepEqual(getNextDailyTourStop(plan), { id: 'battle', type: 'battle_finale' });
  plan = advanceDailyTour(plan, { type: 'skip_battle' });
  assert.equal(summarizeDailyTour(plan).tourSettled, true);
});

test('battle_only starts at Battle and never fakes Daily participation', () => {
  let plan = createDailyTourPlan({
    dayKey: '2026-08-29',
    mode: DAILY_TOUR_MODES.BATTLE_ONLY,
    stops: STOPS,
    includeBattleFinale: false,
  });
  assert.deepEqual(plan.route, []);
  assert.deepEqual(getNextDailyTourStop(plan), { id: 'battle', type: 'battle_finale' });
  plan = advanceDailyTour(plan, { type: 'complete_battle' });
  const summary = summarizeDailyTour(plan);
  assert.equal(summary.battleCompleted, true);
  assert.equal(summary.meaningfulDailyParticipation, false);
});

test('input structures are not mutated', () => {
  const stops = structuredClone(STOPS);
  const before = structuredClone(stops);
  const recommendationOrder = ['tea', 'brain'];
  const orderBefore = [...recommendationOrder];
  createDailyTourPlan({ dayKey: '2026-08-29', stops, recommendationOrder });
  assert.deepEqual(stops, before);
  assert.deepEqual(recommendationOrder, orderBefore);
});

test('core authors no reward, relationship, battle-power or reset-time authority', () => {
  const plan = createDailyTourPlan({ dayKey: 'authority-supplied-day', stops: STOPS });
  const serialized = JSON.stringify(plan);
  for (const forbidden of ['reward', 'relationship', 'battlePower', 'resetAt', 'resetTime']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.equal(plan.dayKey, 'authority-supplied-day');
});

test('invalid mode and missing day authority fail closed', () => {
  assert.throws(() => createDailyTourPlan({ stops: STOPS }), /dayKey/);
  assert.throws(() => createDailyTourPlan({ dayKey: 'd', mode: 'forced_all_clear', stops: STOPS }), /unsupported/);
});
