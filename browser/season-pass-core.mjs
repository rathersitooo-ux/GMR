// season-pass-core.mjs -- S1-03 + S1-13
// Pass (50 levels) state machine. Free column always works; the pass
// column exists as data only -- buying is closed until the pass decision is
// made, so claimPassReward returns PASS_LOCKED and never grants anything.
// Points are capped at 50 levels (50,000 points). Claiming is idempotent
// via the claimed set. Grace period: 7 days after season end, then
// leftover points convert to manny at 100 points = 10 manny.

import { PASS_MILESTONES, PASS_POINT_SOURCES, passRewardForLevel } from './season-s1-config.mjs';

// 保存される状態の目印。名前は古いままにする：以前の版で作られた
// 記録（schema 'gameroad.season-catalog.v1'）も読めなくてはならないため。
const SCHEMA = 'gameroad.season-catalog.v1';
const { pointsPerLevel, maxLevel, graceDays, leftoverPointsPerManny, weeklyCap } = PASS_POINT_SOURCES;

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

function assertState(state) {
  if (!state || typeof state !== 'object' || state.schema !== SCHEMA) throw new TypeError('PASS_STATE_REQUIRED');
  if (typeof state.seasonId !== 'string' || !state.seasonId) throw new TypeError('SEASON_ID_REQUIRED');
  if (!Number.isInteger(state.points) || state.points < 0) throw new TypeError('POINTS_INVALID');
  if (!Array.isArray(state.claimedFree) || !Array.isArray(state.claimedPass)) throw new TypeError('CLAIMED_INVALID');
  return state;
}

export function levelForPoints(points) {
  if (!Number.isInteger(points) || points < 0) throw new TypeError('POINTS_INVALID');
  return Math.min(maxLevel, Math.floor(points / pointsPerLevel));
}

export function pointsForLevel(level) {
  if (!Number.isInteger(level) || level < 0 || level > maxLevel) throw new TypeError('PASS_LEVEL_INVALID');
  return level * pointsPerLevel;
}

export function createPassState({ seasonId, points = 0, claimedFree = [], claimedPass = [], passOwned = false } = {}) {
  if (typeof seasonId !== 'string' || !seasonId) throw new TypeError('SEASON_ID_REQUIRED');
  const capped = Math.min(points, maxLevel * pointsPerLevel);
  return freeze({
    schema: SCHEMA,
    seasonId,
    points: capped,
    level: levelForPoints(capped),
    claimedFree: Object.freeze([...new Set(claimedFree)].sort((a, b) => a - b)),
    claimedPass: Object.freeze([...new Set(claimedPass)].sort((a, b) => a - b)),
    passOwned: passOwned === true,
  });
}

// Points are added as-is: there is no multiplier (the old 1.5x/2x boost
// weeks were removed with the pass rebuild). The weekly cap is applied by
// the callers, not here.
export function addPassPoints(state, rawPoints) {
  assertState(state);
  if (!Number.isFinite(rawPoints) || rawPoints < 0) throw new TypeError('POINTS_INVALID');
  const gained = Math.floor(rawPoints);
  const points = Math.min(state.points + gained, maxLevel * pointsPerLevel);
  return freeze({ ...state, points, level: levelForPoints(points) });
}

// 週上限（第4段）：その週にすでに入った点（weeklyPoints）と、これから
// 入る点（rawPoints）から、実際に入る点を決める。上限（週10000点）を
// 超えた分は入らない。週の区切りは getSeasonWeekForDate が決める。
export function applyWeeklyCap({ weeklyPoints = 0, rawPoints, cap = weeklyCap } = {}) {
  if (!Number.isInteger(weeklyPoints) || weeklyPoints < 0) throw new TypeError('POINTS_INVALID');
  if (!Number.isFinite(rawPoints) || rawPoints < 0) throw new TypeError('POINTS_INVALID');
  if (!Number.isInteger(cap) || cap <= 0) throw new TypeError('WEEKLY_CAP_INVALID');
  const granted = Math.max(0, Math.min(Math.floor(rawPoints), cap - weeklyPoints));
  return freeze({
    granted,
    capped: granted < Math.floor(rawPoints),
    weeklyPointsAfter: weeklyPoints + granted,
    remainingAfter: Math.max(0, cap - (weeklyPoints + granted)),
  });
}

export function nextLevelInfo(state) {
  assertState(state);
  if (state.level >= maxLevel) return freeze({ level: maxLevel, pointsToNext: 0, done: true });
  return freeze({
    level: state.level + 1,
    pointsToNext: pointsForLevel(state.level + 1) - state.points,
    done: false,
    freeReward: passRewardForLevel(state.level + 1, 'free'),
    passReward: passRewardForLevel(state.level + 1, 'pass'),
  });
}

function claim(state, level, column) {
  assertState(state);
  if (!Number.isInteger(level) || level < 1 || level > maxLevel) throw new TypeError('PASS_LEVEL_INVALID');
  if (level > state.level) return freeze({ state, claimed: false, reason: 'NOT_REACHED' });
  const key = column === 'pass' ? 'claimedPass' : 'claimedFree';
  if (state[key].includes(level)) return freeze({ state, claimed: false, reason: 'ALREADY_CLAIMED' });
  if (column === 'pass' && !state.passOwned) {
    return freeze({ state, claimed: false, reason: 'PASS_LOCKED' });
  }
  const reward = passRewardForLevel(level, column);
  const next = freeze({
    ...state,
    [key]: Object.freeze([...state[key], level].sort((a, b) => a - b)),
  });
  return freeze({ state: next, claimed: true, reason: 'OK', reward });
}

export function claimFreeReward(state, level) { return claim(state, level, 'free'); }
export function claimPassReward(state, level) { return claim(state, level, 'pass'); }

export function claimableLevels(state) {
  assertState(state);
  const levels = [];
  for (let level = 1; level <= state.level; level += 1) {
    if (!state.claimedFree.includes(level)) levels.push(level);
  }
  return freeze(levels);
}

// Season end: unclaimed rewards stay claimable for `graceDays` (7) days.
// After that, leftover points convert to manny. `daysAfterEnd` is counted
// in whole days from the season end day (0 = end day itself).
export function seasonGraceInfo({ daysAfterEnd }) {
  if (!Number.isInteger(daysAfterEnd) || daysAfterEnd < 0) throw new TypeError('DAYS_INVALID');
  if (daysAfterEnd <= graceDays) {
    return freeze({ inGrace: true, daysLeft: graceDays - daysAfterEnd, convertedManny: 0 });
  }
  return freeze({ inGrace: false, daysLeft: 0, convertedManny: 0 });
}

export function convertLeftoverPoints(state) {
  assertState(state);
  const manny = Math.floor(state.points / leftoverPointsPerManny);
  return freeze({ manny, pointsConverted: state.points });
}

export function summarizePass(state) {
  assertState(state);
  const next = nextLevelInfo(state);
  return freeze({
    seasonId: state.seasonId,
    level: state.level,
    points: state.points,
    pointsToNext: next.pointsToNext,
    claimedCount: state.claimedFree.length,
    claimableCount: claimableLevels(state).length,
    isMax: state.level >= maxLevel,
    isMilestoneLevel: Object.prototype.hasOwnProperty.call(PASS_MILESTONES, state.level),
  });
}
