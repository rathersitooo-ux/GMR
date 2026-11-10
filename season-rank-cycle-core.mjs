// season-rank-cycle-core.mjs -- S1-05
// Rank half-cycles (24/year) on top of the calendar core. Tiers are the
// plan's 5 tiers (bronze..master, 4 steps each). Reset rule (plan):
// top tiers drop 1-2 steps at the next cycle start, lower tiers stay,
// and a tier never drops inside a cycle. Settling a cycle is idempotent
// by cycleId. Festival main time pauses rank (see calendar core).

import { RANK_TIERS } from './season-s1-config.mjs';
import { getRankCycleForDate } from './season-calendar-core.mjs';

const STEPS_PER_TIER = 4;

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

function assertTier(tierIndex, step) {
  if (!Number.isInteger(tierIndex) || tierIndex < 0 || tierIndex >= RANK_TIERS.length) throw new TypeError('TIER_INVALID');
  if (!Number.isInteger(step) || step < 1 || step > STEPS_PER_TIER) throw new TypeError('STEP_INVALID');
}

// Reset at the next cycle start: master drops 2 steps, platinum drops 1,
// gold and below stay. Returns {tierIndex, step} (never below bronze 1).
export function resetTierForNextCycle(tierIndex, step) {
  assertTier(tierIndex, step);
  let nextTier = tierIndex;
  let nextStep = step;
  if (tierIndex === 4) nextStep = step - 2;
  else if (tierIndex === 3) nextStep = step - 1;
  while (nextStep < 1) {
    nextTier -= 1;
    nextStep += STEPS_PER_TIER;
  }
  if (nextTier < 0) { nextTier = 0; nextStep = 1; }
  return freeze({ tierIndex: nextTier, step: nextStep, tierId: RANK_TIERS[nextTier].id, label: RANK_TIERS[nextTier].label });
}

export function rankRewardForTier(tierIndex) {
  assertTier(tierIndex, 1);
  return freeze({ ...RANK_TIERS[tierIndex].reward, tierId: RANK_TIERS[tierIndex].id });
}

// Settle one cycle: grants the tier reward once. `settledCycleIds` is the
// caller's record of already-settled cycles (kept outside this pure core).
export function settleRankCycle({ cycleId, tierIndex, step, settledCycleIds = [] } = {}) {
  if (typeof cycleId !== 'string' || !cycleId) throw new TypeError('CYCLE_ID_REQUIRED');
  assertTier(tierIndex, step);
  if (settledCycleIds.includes(cycleId)) {
    return freeze({ settled: false, reason: 'ALREADY_SETTLED', reward: null, nextTier: null, settledCycleIds: Object.freeze([...settledCycleIds]) });
  }
  return freeze({
    settled: true,
    reason: 'OK',
    reward: rankRewardForTier(tierIndex),
    nextTier: resetTierForNextCycle(tierIndex, step),
    settledCycleIds: Object.freeze([...settledCycleIds, cycleId]),
  });
}

export function rankCycleSummary(input, tierIndex, step) {
  const cycle = getRankCycleForDate(input);
  assertTier(tierIndex, step);
  return freeze({
    ...cycle,
    tierId: RANK_TIERS[tierIndex].id,
    tierLabel: RANK_TIERS[tierIndex].label,
    step,
    reward: rankRewardForTier(tierIndex),
  });
}
