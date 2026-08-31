function asNonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
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
