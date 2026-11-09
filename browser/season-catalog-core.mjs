// season-catalog-core.mjs -- S1-03 + S1-13
// Catalog (100 levels) state machine. Free column always works; the pass
// column exists as data only -- buying is closed until the pass decision is
// made, so claimPassReward returns PASS_LOCKED and never grants anything.
// Points are capped at 100 levels (10,000 points). Claiming is idempotent
// via the claimed set. Grace period: 7 days after season end, then
// leftover points convert to manny at 100 points = 10 manny.

import { CATALOG_MILESTONES, CATALOG_POINT_SOURCES, catalogRewardForLevel } from './season-s1-config.mjs';

const SCHEMA = 'gameroad.season-catalog.v1';
const { pointsPerLevel, maxLevel, graceDays, leftoverPointsPerManny } = CATALOG_POINT_SOURCES;

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

function assertState(state) {
  if (!state || typeof state !== 'object' || state.schema !== SCHEMA) throw new TypeError('CATALOG_STATE_REQUIRED');
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
  if (!Number.isInteger(level) || level < 0 || level > maxLevel) throw new TypeError('CATALOG_LEVEL_INVALID');
  return level * pointsPerLevel;
}

export function createCatalogState({ seasonId, points = 0, claimedFree = [], claimedPass = [], passOwned = false } = {}) {
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

export function addCatalogPoints(state, rawPoints, multiplier = 1) {
  assertState(state);
  if (!Number.isFinite(rawPoints) || rawPoints < 0) throw new TypeError('POINTS_INVALID');
  if (![1, 1.5, 2].includes(multiplier)) throw new TypeError('MULTIPLIER_INVALID');
  const gained = Math.floor(rawPoints * multiplier);
  const points = Math.min(state.points + gained, maxLevel * pointsPerLevel);
  return freeze({ ...state, points, level: levelForPoints(points) });
}

export function nextLevelInfo(state) {
  assertState(state);
  if (state.level >= maxLevel) return freeze({ level: maxLevel, pointsToNext: 0, done: true });
  return freeze({
    level: state.level + 1,
    pointsToNext: pointsForLevel(state.level + 1) - state.points,
    done: false,
    freeReward: catalogRewardForLevel(state.level + 1, 'free'),
    passReward: catalogRewardForLevel(state.level + 1, 'pass'),
  });
}

function claim(state, level, column) {
  assertState(state);
  if (!Number.isInteger(level) || level < 1 || level > maxLevel) throw new TypeError('CATALOG_LEVEL_INVALID');
  if (level > state.level) return freeze({ state, claimed: false, reason: 'NOT_REACHED' });
  const key = column === 'pass' ? 'claimedPass' : 'claimedFree';
  if (state[key].includes(level)) return freeze({ state, claimed: false, reason: 'ALREADY_CLAIMED' });
  if (column === 'pass' && !state.passOwned) {
    return freeze({ state, claimed: false, reason: 'PASS_LOCKED' });
  }
  const reward = catalogRewardForLevel(level, column);
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

export function summarizeCatalog(state) {
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
    isMilestoneLevel: Object.prototype.hasOwnProperty.call(CATALOG_MILESTONES, state.level),
  });
}
