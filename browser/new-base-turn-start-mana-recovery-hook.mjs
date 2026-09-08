export const NEW_BASE_TURN_START_MANA_RECOVERY_SCHEMA = 'gameroad.new-base-turn-start-mana-recovery.v1';

function result(status, recoveryAmount, authorityResult = null) {
  return Object.freeze({
    schema: NEW_BASE_TURN_START_MANA_RECOVERY_SCHEMA,
    status,
    applied: status === 'APPLIED_BY_AUTHORITY',
    recoveryAmount,
    authorityResult,
  });
}

/**
 * Thin new-base turn-start hook.
 *
 * This module intentionally owns no mana state and interprets no recovery
 * amount. The caller decides when a turn starts, supplies the current
 * configured amount, and provides the existing mana authority that applies it.
 */
export function runNewBaseTurnStartManaRecovery({
  recoveryAmount,
  applyManaRecovery,
  context = null,
} = {}) {
  if (recoveryAmount === undefined || recoveryAmount === null) {
    return result('CONFIG_REQUIRED', recoveryAmount ?? null);
  }

  if (typeof applyManaRecovery !== 'function') {
    return result('AUTHORITY_REQUIRED', recoveryAmount);
  }

  const authorityResult = applyManaRecovery({ recoveryAmount, context });
  return result('APPLIED_BY_AUTHORITY', recoveryAmount, authorityResult);
}
