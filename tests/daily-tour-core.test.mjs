import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DAILY_TOUR_GACHA_STOP_ID,
  DAILY_TOUR_STOP_KINDS,
  advanceDailyTour,
  createDailyTourPlan,
  getNextDailyTourStop,
  summarizeDailyTour,
} from '../browser/daily-tour-core.mjs';

const eligible = (id, kind = DAILY_TOUR_STOP_KINDS.FREE, extra = {}) => ({
  id,
  kind,
  authoritative: true,
  eligible: true,
  ...extra,
});

test('authoritative eligible free Gacha is first regardless of caller order', () => {
  const plan = createDailyTourPlan({
    dayKey: 'authority-day-1',
    stops: [
      eligible('daily_ticket', DAILY_TOUR_STOP_KINDS.CLAIMABLE),
      eligible(DAILY_TOUR_GACHA_STOP_ID),
      eligible('daily_vote'),
    ],
  });
  assert.deepEqual(plan.route.map((stop) => stop.id), [
    DAILY_TOUR_GACHA_STOP_ID,
    'daily_ticket',
    'daily_vote',
  ]);
});

test('Gacha is not fabricated when its daily eligibility authority is absent', () => {
  const plan = createDailyTourPlan({
    dayKey: 'authority-day-2',
    stops: [
      { id: DAILY_TOUR_GACHA_STOP_ID, kind: 'free', authoritative: false, eligible: true },
      eligible('daily_ticket', 'claimable'),
    ],
  });
  assert.deepEqual(plan.route.map((stop) => stop.id), ['daily_ticket']);
});

test('unauthoritative, ineligible, consumed and paid-fallback stops fail closed', () => {
  const plan = createDailyTourPlan({
    dayKey: 'authority-day-3',
    stops: [
      eligible('ok'),
      { id: 'no-authority', kind: 'free', authoritative: false, eligible: true },
      { id: 'not-eligible', kind: 'free', authoritative: true, eligible: false },
      eligible('consumed', 'claimable', { consumed: true }),
      eligible('paid', 'free', { requiresPaidResource: true }),
      eligible('paid-fallback', 'free', { paidFallbackAllowed: true }),
      { id: 'unknown-kind', kind: 'background', authoritative: true, eligible: true },
    ],
  });
  assert.deepEqual(plan.route.map((stop) => stop.id), ['ok']);
});

test('Mission and Battle are never auto-inserted Tour stops', () => {
  const plan = createDailyTourPlan({
    dayKey: 'authority-day-4',
    stops: [
      eligible('missions', 'claimable'),
      eligible('mission_progress', 'claimable'),
      eligible('season_mission', 'claimable'),
      eligible('battle'),
      eligible('daily_ticket', 'claimable'),
    ],
  });
  assert.deepEqual(plan.route.map((stop) => stop.id), ['daily_ticket']);
});

test('Vote appears only when caller supplies current authoritative eligibility', () => {
  const provisional = createDailyTourPlan({
    dayKey: 'authority-day-5a',
    stops: [{ id: 'vote', kind: 'free', authoritative: false, eligible: true }],
  });
  assert.deepEqual(provisional.route, []);

  const production = createDailyTourPlan({
    dayKey: 'authority-day-5b',
    stops: [eligible('vote')],
  });
  assert.deepEqual(production.route.map((stop) => stop.id), ['vote']);
});

test('next stop exposes only projection identity and free/claimable kind', () => {
  const plan = createDailyTourPlan({
    dayKey: 'authority-day-6',
    stops: [eligible('claim', 'claimable')],
  });
  assert.deepEqual(getNextDailyTourStop(plan), {
    id: 'claim',
    kind: 'claimable',
    type: 'daily_free_or_claimable',
  });
});

test('completion is exactly-once in Tour projection and repeated completion is idempotent', () => {
  const original = createDailyTourPlan({ dayKey: 'authority-day-7', stops: [eligible('free')] });
  const once = advanceDailyTour(original, { type: 'complete_stop', stopId: 'free' });
  const twice = advanceDailyTour(once, { type: 'complete_stop', stopId: 'free' });
  assert.strictEqual(twice, once);
  assert.equal(summarizeDailyTour(twice).completedStopCount, 1);
  assert.equal(summarizeDailyTour(twice).tourSettled, true);
});

test('failure skips the projection and does not create debt or paid fallback', () => {
  let plan = createDailyTourPlan({
    dayKey: 'authority-day-8',
    stops: [eligible('free'), eligible('claim', 'claimable')],
  });
  plan = advanceDailyTour(plan, { type: 'fail_stop', stopId: 'free' });
  const summary = summarizeDailyTour(plan);
  assert.equal(plan.route[0].status, 'skipped');
  assert.equal(summary.hasDebt, false);
  assert.deepEqual(getNextDailyTourStop(plan)?.id, 'claim');
});

test('interruption hides next stop and resume preserves progress', () => {
  let plan = createDailyTourPlan({
    dayKey: 'authority-day-9',
    stops: [eligible('first'), eligible('second', 'claimable')],
  });
  plan = advanceDailyTour(plan, { type: 'complete_stop', stopId: 'first' });
  plan = advanceDailyTour(plan, { type: 'interrupt' });
  assert.equal(getNextDailyTourStop(plan), null);
  plan = advanceDailyTour(plan, { type: 'resume' });
  assert.equal(getNextDailyTourStop(plan)?.id, 'second');
  assert.equal(summarizeDailyTour(plan).completedStopCount, 1);
});

test('input structures are not mutated', () => {
  const stops = [eligible('ticket', 'claimable'), eligible(DAILY_TOUR_GACHA_STOP_ID)];
  const before = structuredClone(stops);
  createDailyTourPlan({ dayKey: 'authority-day-10', stops });
  assert.deepEqual(stops, before);
});

test('core authors no reward, reset, receipt, ownership, currency or payment authority', () => {
  const plan = createDailyTourPlan({
    dayKey: 'authority-supplied-day',
    stops: [eligible('free')],
  });
  const serialized = JSON.stringify(plan);
  for (const forbidden of [
    'reward',
    'resetAt',
    'resetTime',
    'receipt',
    'ownership',
    'currency',
    'price',
    'paidFallback',
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.equal(plan.dayKey, 'authority-supplied-day');
});

test('missing day authority fails closed', () => {
  assert.throws(() => createDailyTourPlan({ stops: [eligible('free')] }), /dayKey/);
});
