import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDailyTourPlanFromSelection,
  deriveDailyTourAvailability,
} from '../browser/daily-tour-runtime-mount.mjs';
import {
  advanceDailyTour,
  getNextDailyTourStop,
  summarizeDailyTour,
} from '../browser/daily-tour-core.mjs';

const registry = {
  schemaVersion: 'gameroad-daily-tour-mode-registry-v1',
  entries: [
    { modeId: 'fossil', class: 'TOUR_ELIGIBLE', runtimeState: 'CURRENT_CORE_PRESENT', tourPolicy: { canAppearInPlan: true, finaleRole: 'NONE' } },
    { modeId: 'partner_tea', class: 'TOUR_ELIGIBLE', runtimeState: 'PARTIAL', tourPolicy: { canAppearInPlan: true, finaleRole: 'NONE' } },
    { modeId: 'vote', class: 'QUICK_STOP', runtimeState: 'PROVISIONAL', tourPolicy: { canAppearInPlan: false, finaleRole: 'NONE' } },
    { modeId: 'battle', class: 'TOUR_ELIGIBLE', runtimeState: 'CURRENT_CORE_PRESENT', tourPolicy: { canAppearInPlan: true, finaleRole: 'OPTIONAL_FINALE' } },
    { modeId: 'brain_training', class: 'TOUR_ELIGIBLE', runtimeState: 'CURRENT_CORE_CONTENT_V1', tourPolicy: { canAppearInPlan: true, finaleRole: 'NONE' } },
  ],
};

test('availability exposes Brain plus exact Home routes without inventing aliases', () => {
  const availability = deriveDailyTourAvailability(registry, ['fossil', 'characters']);
  assert.deepEqual(availability.map(({ id, supported, finale }) => ({ id, supported, finale })), [
    { id: 'fossil', supported: true, finale: false },
    { id: 'partner_tea', supported: false, finale: false },
    { id: 'battle', supported: true, finale: true },
    { id: 'brain_training', supported: true, finale: false },
  ]);
});

test('selection creates only chosen regular stops and optional Battle finale', () => {
  let plan = createDailyTourPlanFromSelection({
    dayKey: '2026-08-30',
    registry,
    routeIds: ['fossil'],
    selectedIds: ['brain_training'],
    includeBattle: true,
  });
  assert.deepEqual(plan.route.map((stop) => stop.id), ['brain_training']);
  assert.equal(plan.battle.enabled, true);
  assert.deepEqual(getNextDailyTourStop(plan), { id: 'brain_training', type: 'daily_stop' });

  plan = advanceDailyTour(plan, { type: 'complete_stop', stopId: 'brain_training' });
  assert.deepEqual(getNextDailyTourStop(plan), { id: 'battle', type: 'battle_finale' });
  plan = advanceDailyTour(plan, { type: 'skip_battle' });

  const summary = summarizeDailyTour(plan);
  assert.equal(summary.tourSettled, true);
  assert.equal(summary.hasDebt, false);
  assert.equal(summary.completedStopCount, 1);
});

test('empty regular selection does not auto-insert registry stops', () => {
  assert.equal(createDailyTourPlanFromSelection({
    dayKey: '2026-08-30',
    registry,
    routeIds: ['fossil'],
    selectedIds: [],
    includeBattle: false,
  }), null);

  const battleOnly = createDailyTourPlanFromSelection({
    dayKey: '2026-08-30',
    registry,
    routeIds: ['fossil'],
    selectedIds: [],
    includeBattle: true,
  });
  assert.deepEqual(battleOnly.route, []);
  assert.equal(battleOnly.battle.enabled, true);
});
