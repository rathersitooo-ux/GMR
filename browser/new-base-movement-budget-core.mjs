function asNonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function normalizeAdditionalMovementDeltas(values) {
  if (!Array.isArray(values)) return null;
  const normalized = [];
  for (const value of values) {
    const delta = asNonNegativeSafeInteger(value);
    if (delta === null) return null;
    normalized.push(delta);
  }
  return normalized;
}

/**
 * Compose a turn movement budget from values already authorized by upstream rules.
 *
 * This module intentionally does not:
 * - roll or validate a die's face/range,
 * - derive card movement values,
 * - clamp or otherwise rewrite movement,
 * - decide path legality/stoppability,
 * - reserve/revalidate movement or resolve collisions,
 * - apply Honey-specific side effects.
 */
export function composeTurnMovementBudget({
  baseMovementBudget,
  diceMovementDelta,
} = {}) {
  const base = asNonNegativeSafeInteger(baseMovementBudget);
  const dice = asNonNegativeSafeInteger(diceMovementDelta);

  if (base === null || dice === null) return null;

  const total = base + dice;
  if (!Number.isSafeInteger(total)) return null;

  return Object.freeze({
    baseMovementBudget: base,
    diceMovementDelta: dice,
    totalMovementBudget: total,
  });
}

/**
 * Compose the current turn movement budget from explicit authoritative sources.
 *
 * Printed card rank/number is deliberately absent from this boundary. A Road card
 * with no movement effect contributes zero. A ruleset/map with no dice contributes
 * zero. Callers may add other already-resolved movement effects without changing
 * how the movement consumer interprets the total.
 */
export function composeExplicitTurnMovementBudget({
  ruleMovementDelta = 0,
  cardMovementDelta = 0,
  diceMovementDelta = 0,
  additionalMovementDeltas = [],
} = {}) {
  const rule = asNonNegativeSafeInteger(ruleMovementDelta);
  const card = asNonNegativeSafeInteger(cardMovementDelta);
  const dice = asNonNegativeSafeInteger(diceMovementDelta);
  const additional = normalizeAdditionalMovementDeltas(additionalMovementDeltas);
  if (rule === null || card === null || dice === null || additional === null) return null;

  let total = rule + card + dice;
  if (!Number.isSafeInteger(total)) return null;
  for (const delta of additional) {
    total += delta;
    if (!Number.isSafeInteger(total)) return null;
  }

  return Object.freeze({
    ruleMovementDelta: rule,
    cardMovementDelta: card,
    diceMovementDelta: dice,
    additionalMovementDeltas: Object.freeze([...additional]),
    totalMovementBudget: total,
  });
}
