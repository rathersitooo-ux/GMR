import test from 'node:test';
import assert from 'node:assert/strict';

import {
  rankCycleSummary,
  rankRewardForTier,
  resetTierForNextCycle,
  settleRankCycle,
} from '../browser/season-rank-cycle-core.mjs';

test('reset: master drops 2 steps, platinum 1, lower tiers stay', () => {
  assert.deepEqual(resetTierForNextCycle(4, 4), { tierIndex: 4, step: 2, tierId: 'master', label: 'マスター' });
  assert.deepEqual(resetTierForNextCycle(4, 1), { tierIndex: 3, step: 3, tierId: 'platinum', label: 'プラチナ' });
  assert.deepEqual(resetTierForNextCycle(3, 2), { tierIndex: 3, step: 1, tierId: 'platinum', label: 'プラチナ' });
  assert.deepEqual(resetTierForNextCycle(2, 3), { tierIndex: 2, step: 3, tierId: 'gold', label: 'ゴールド' });
  assert.deepEqual(resetTierForNextCycle(0, 1), { tierIndex: 0, step: 1, tierId: 'bronze', label: 'ブロンズ' });
});

test('settling a cycle is idempotent by cycleId', () => {
  const first = settleRankCycle({ cycleId: 'R-01-first', tierIndex: 2, step: 3 });
  assert.equal(first.settled, true);
  assert.equal(first.reward.packTickets, 2);
  assert.equal(first.nextTier.tierIndex, 2);
  const again = settleRankCycle({ cycleId: 'R-01-first', tierIndex: 2, step: 3, settledCycleIds: first.settledCycleIds });
  assert.equal(again.settled, false);
  assert.equal(again.reason, 'ALREADY_SETTLED');
});

test('summary ties the cycle, tier and reward together', () => {
  const summary = rankCycleSummary({ month: 1, day: 20, hour: 12 }, 4, 4);
  assert.equal(summary.cycleId, 'R-01-second');
  assert.equal(summary.pausedForFestival, true);
  assert.equal(summary.reward.tierId, 'master');
  assert.equal(rankRewardForTier(0).manny, 100);
});
