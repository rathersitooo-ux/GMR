import { requireConfiguredNewBaseManaRecoveryAmount } from './new-base-mana-recovery-config.mjs';

/**
 * Execute the new-base turn-start mana recovery hook without defining a new
 * mana model. The authoritative amount comes from the externalized new-base
 * config seam, while the actual mana mutation remains owned by the caller's
 * existing/shared Battle mana consumer.
 *
 * The hook intentionally has no numeric fallback, max/current mana model,
 * full-refill behavior, or Pursuit-specific mana semantics.
 */
export function applyNewBaseTurnStartManaRecovery({
  manaRecoveryConfig,
  recoverMana,
} = {}) {
  if (typeof recoverMana !== 'function') {
    throw new TypeError('recoverMana must be a function supplied by the shared Battle mana consumer');
  }

  const amount = requireConfiguredNewBaseManaRecoveryAmount(manaRecoveryConfig);
  return recoverMana(amount);
}
