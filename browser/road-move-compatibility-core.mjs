const MIN_ROAD_VALUE = 1;
const MAX_ROAD_VALUE = 6;

function safeCall(fn, args, receiver) {
  if (typeof fn !== 'function') return { ok: false, value: undefined };
  try {
    return { ok: true, value: fn.apply(receiver, args) };
  } catch {
    return { ok: false, value: undefined };
  }
}

function readRoadValue(card, boardState) {
  const result = safeCall(boardState?.roadValueOf, [card], boardState);
  if (!result.ok) return null;
  const value = result.value;
  if (!Number.isSafeInteger(value) || value < MIN_ROAD_VALUE || value > MAX_ROAD_VALUE) return null;
  return value;
}

function readStepCount(path, boardState) {
  const result = safeCall(boardState?.pathStepCountOf, [path], boardState);
  if (!result.ok) return null;
  const steps = result.value;
  if (!Number.isSafeInteger(steps) || steps < 1) return null;
  return steps;
}

function pathPasses(predicate, path, boardState) {
  const result = safeCall(predicate, [path], boardState);
  return result.ok && result.value === true;
}

/**
 * Pure Road-card/path compatibility predicate.
 *
 * This module intentionally does not own the 109-position graph, adjacency,
 * path representation, stoppability, or card schema. The current runtime
 * supplies those existing decisions through boardState adapters:
 *   - roadValueOf(card) -> integer 1..6 for a Road card, otherwise null/invalid
 *   - pathStepCountOf(path) -> positive integer movement step count
 *   - isPathLegal(path) -> true only for the current legal path
 *   - isPathStoppable(path) -> true only when the current endpoint may stop
 *
 * Road value is an upper bound, never an exact-distance requirement.
 */
export function compatible(card, path, boardState) {
  if (!boardState || typeof boardState !== 'object') return false;

  const roadValue = readRoadValue(card, boardState);
  if (roadValue === null) return false;

  const steps = readStepCount(path, boardState);
  if (steps === null || steps > roadValue) return false;

  if (!pathPasses(boardState.isPathLegal, path, boardState)) return false;
  if (!pathPasses(boardState.isPathStoppable, path, boardState)) return false;

  return true;
}

/**
 * Derived candidate set for the current draft path.
 * No focus, selection, submission, or card mutation occurs here.
 */
export function compatibleRoadCards(handRoadCards, path, boardState) {
  if (!Array.isArray(handRoadCards)) return [];
  return handRoadCards.filter(card => compatible(card, path, boardState));
}
