import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addCatalogPoints,
  claimFreeReward,
  claimPassReward,
  claimableLevels,
  convertLeftoverPoints,
  createCatalogState,
  levelForPoints,
  nextLevelInfo,
  seasonGraceInfo,
  summarizeCatalog,
} from '../browser/season-catalog-core.mjs';

test('levels: 100 points per level, capped at 100', () => {
  assert.equal(levelForPoints(0), 0);
  assert.equal(levelForPoints(99), 0);
  assert.equal(levelForPoints(100), 1);
  assert.equal(levelForPoints(9999), 99);
  assert.equal(levelForPoints(10000), 100);
  const capped = addCatalogPoints(createCatalogState({ seasonId: 'S1' }), 999999);
  assert.equal(capped.level, 100);
  assert.equal(capped.points, 10000);
});

test('multipliers: mid boost x1.5 and final rush x2 apply to gained points', () => {
  const base = createCatalogState({ seasonId: 'S1' });
  assert.equal(addCatalogPoints(base, 100, 1.5).points, 150);
  assert.equal(addCatalogPoints(base, 100, 2).points, 200);
  assert.equal(addCatalogPoints(base, 10, 1.5).points, 15);
  assert.throws(() => addCatalogPoints(base, 10, 3), /MULTIPLIER_INVALID/);
});

test('claiming is idempotent and locked levels cannot be claimed', () => {
  let state = createCatalogState({ seasonId: 'S1' });
  state = addCatalogPoints(state, 250);
  assert.equal(state.level, 2);
  const first = claimFreeReward(state, 1);
  assert.equal(first.claimed, true);
  assert.equal(first.reward.kind, 'manny');
  const again = claimFreeReward(first.state, 1);
  assert.equal(again.claimed, false);
  assert.equal(again.reason, 'ALREADY_CLAIMED');
  assert.equal(claimFreeReward(first.state, 5).reason, 'NOT_REACHED');
  assert.deepEqual(claimableLevels(first.state), [2]);
  assert.equal(summarizeCatalog(first.state).claimableCount, 1);
});

test('pass column stays locked until the pass decision is made', () => {
  const state = addCatalogPoints(createCatalogState({ seasonId: 'S1' }), 100);
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
  const state = addCatalogPoints(createCatalogState({ seasonId: 'S1' }), 550);
  assert.deepEqual(convertLeftoverPoints(state), { manny: 55, pointsConverted: 550 });
  assert.equal(nextLevelInfo(createCatalogState({ seasonId: 'S1', points: 10000 })).done, true);
});
