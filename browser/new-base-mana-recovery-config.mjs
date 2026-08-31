const STATUS = Object.freeze({
  UNDECIDED: 'UNDECIDED',
  CONFIGURED: 'CONFIGURED',
});

const TURN_START_AMOUNT_KEY = 'turnStartManaRecoveryAmount';

export const NEW_BASE_MANA_RECOVERY_STATUS = STATUS;
export const NEW_BASE_MANA_RECOVERY_AMOUNT_KEY = TURN_START_AMOUNT_KEY;

function unresolvedConfig() {
  return Object.freeze({
    status: STATUS.UNDECIDED,
    amount: null,
  });
}

function configuredConfig(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new TypeError(
      `${TURN_START_AMOUNT_KEY} must be a finite number supplied by the authoritative rules config`,
    );
  }

  return Object.freeze({
    status: STATUS.CONFIGURED,
    amount,
  });
}

/**
 * Read the new-base turn-start mana recovery parameter without inventing a
 * gameplay value. Absence means the amount is still formally UNDECIDED.
 *
 * This module is deliberately data-only. It does not mutate mana, inspect
 * max/current mana, inherit legacy full-refill behavior, or import Pursuit
 * mana semantics. A turn-start consumer may compose this config with the
 * existing shared Battle mana state only after an authoritative amount exists.
 */
export function readNewBaseManaRecoveryConfig(source = {}) {
  if (source == null || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError('new-base mana recovery config source must be an object');
  }

  if (!Object.prototype.hasOwnProperty.call(source, TURN_START_AMOUNT_KEY)) {
    return unresolvedConfig();
  }

  return configuredConfig(source[TURN_START_AMOUNT_KEY]);
}

/**
 * Fail closed when a runtime consumer needs a concrete amount but the rule is
 * still undecided. This prevents an implicit 0, max-mana refill, or any other
 * fallback from silently becoming gameplay authority.
 */
export function requireConfiguredNewBaseManaRecoveryAmount(config) {
  if (config == null || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('new-base mana recovery config must be an object');
  }

  if (config.status === STATUS.UNDECIDED) {
    if (config.amount !== null) {
      throw new TypeError('UNDECIDED new-base mana recovery config must have amount=null');
    }
    throw new Error('new-base mana recovery amount is still UNDECIDED');
  }

  if (config.status !== STATUS.CONFIGURED) {
    throw new TypeError(`unknown new-base mana recovery status: ${String(config.status)}`);
  }

  if (typeof config.amount !== 'number' || !Number.isFinite(config.amount)) {
    throw new TypeError('CONFIGURED new-base mana recovery amount must be a finite number');
  }

  return config.amount;
}
