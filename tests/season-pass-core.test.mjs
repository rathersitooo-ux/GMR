import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addPassPoints,
  applyWeeklyCap,
  claimFreeReward,
  claimPassReward,
  claimableLevels,
  convertLeftoverPoints,
  createPassState,
  levelForPoints,
  nextLevelInfo,
  seasonGraceInfo,
  summarizePass,
} from '../browser/season-pass-core.mjs';

test('levels: 1000 points per level, capped at 50', () => {
  assert.equal(levelForPoints(0), 0);
  assert.equal(levelForPoints(999), 0);
  assert.equal(levelForPoints(1000), 1);
  assert.equal(levelForPoints(49999), 49);
  assert.equal(levelForPoints(50000), 50);
  const capped = addPassPoints(createPassState({ seasonId: 'S1' }), 999999);
  assert.equal(capped.level, 50);
  assert.equal(capped.points, 50000);
});

test('points are added as-is: no multiplier', () => {
  const base = createPassState({ seasonId: 'S1' });
  assert.equal(addPassPoints(base, 100).points, 100);
  assert.equal(addPassPoints(base, 10).points, 10);
  assert.equal(addPassPoints(base, 999999).points, 50000);
});

test('claiming is idempotent and locked levels cannot be claimed', () => {
  let state = createPassState({ seasonId: 'S1' });
  state = addPassPoints(state, 2500);
  assert.equal(state.level, 2);
  const first = claimFreeReward(state, 1);
  assert.equal(first.claimed, true);
  assert.equal(first.reward.kind, 'manny');
  const again = claimFreeReward(first.state, 1);
  assert.equal(again.claimed, false);
  assert.equal(again.reason, 'ALREADY_CLAIMED');
  assert.equal(claimFreeReward(first.state, 5).reason, 'NOT_REACHED');
  assert.deepEqual(claimableLevels(first.state), [2]);
  assert.equal(summarizePass(first.state).claimableCount, 1);
});

test('pass column stays locked until the pass decision is made', () => {
  const state = addPassPoints(createPassState({ seasonId: 'S1' }), 1000);
  const locked = claimPassReward(state, 1);
  assert.equal(locked.claimed, false);
  assert.equal(locked.reason, 'PASS_LOCKED');
  // Free column alone can still run a whole season.
  assert.equal(claimFreeReward(state, 1).claimed, true);
});

test('grace 7 days, then leftover points convert 100 points = 10 manny', () => {
  assert.equal(seasonGraceInfo({ daysAfterEnd: 0 }).inGrace, true);
  assert.equal(seasonGraceInfo({ daysAfterEnd: 7 }).inGrace, true);
  assert.equal(seasonGraceInfo({ daysAfterEnd: 8 }).inGrace, false);
  const state = addPassPoints(createPassState({ seasonId: 'S1' }), 550);
  assert.deepEqual(convertLeftoverPoints(state), { manny: 55, pointsConverted: 550 });
  assert.equal(nextLevelInfo(createPassState({ seasonId: 'S1', points: 50000 })).done, true);
});

// --- 移し替え（3b）：tests/season-weekly-cap.test.mjs から移した1件 ---
test('applyWeeklyCap: grants up to the cap and reports the cut', () => {
  assert.deepEqual(applyWeeklyCap({ weeklyPoints: 0, rawPoints: 250 }), {
    granted: 250, capped: false, weeklyPointsAfter: 250, remainingAfter: 9750,
  });
  assert.deepEqual(applyWeeklyCap({ weeklyPoints: 9900, rawPoints: 250 }), {
    granted: 100, capped: true, weeklyPointsAfter: 10000, remainingAfter: 0,
  });
  assert.deepEqual(applyWeeklyCap({ weeklyPoints: 10000, rawPoints: 250 }), {
    granted: 0, capped: true, weeklyPointsAfter: 10000, remainingAfter: 0,
  });
  assert.throws(() => applyWeeklyCap({ weeklyPoints: 0, rawPoints: 10, cap: 0 }), /WEEKLY_CAP_INVALID/);
});
