function safeCall(fn, args, receiver) {
  if (typeof fn !== 'function') return { ok: false, value: undefined };
  try {
    return { ok: true, value: fn.apply(receiver, args) };
  } catch {
    return { ok: false, value: undefined };
  }
}

function readMovementBudget(card, boardState) {
  const result = safeCall(boardState?.movementBudgetOf, [card], boardState);
  if (!result.ok) return null;
  const value = result.value;
  if (!Number.isSafeInteger(value) || value < 0) return null;
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
 * path representation, stoppability, card schema, dice rule, or card effects.
 * The current runtime supplies those existing decisions through boardState:
 *   - movementBudgetOf(card) -> authoritative total movement budget for using
 *     that card as Road now, or null/invalid when it is not a Road candidate
 *   - pathStepCountOf(path) -> positive integer movement step count
 *   - isPathLegal(path) -> true only for the current legal path
 *   - isPathStoppable(path) -> true only when the current endpoint may stop
 *
 * A printed card number/rank is never movement authority here. A valid Road
 * card may have movement budget 0. Optional dice and explicit card/rule effects
 * belong upstream and may be composed into movementBudgetOf(card).
 */
export function compatible(card, path, boardState) {
  if (!boardState || typeof boardState !== 'object') return false;

  const movementBudget = readMovementBudget(card, boardState);
  if (movementBudget === null) return false;

  const steps = readStepCount(path, boardState);
  if (steps === null || steps > movementBudget) return false;

  if (!pathPasses(boardState.isPathLegal, path, boardState)) return false;
  if (!pathPasses(boardState.isPathStoppable, path, boardState)) return false;

  return true;
}

/**
 * Derived candidate set for the current draft path.
 * No focus, selection, submission, card mutation, dice roll, or movement write
 * occurs here.
 */
export function compatibleRoadCards(handRoadCards, path, boardState) {
  if (!Array.isArray(handRoadCards)) return [];
  return handRoadCards.filter(card => compatible(card, path, boardState));
}
