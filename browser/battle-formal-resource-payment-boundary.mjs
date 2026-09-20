export const FORMAL_RESOURCE_PAYMENT_KIND = Object.freeze({
  ROAD: 'ROAD',
  BATTLE: 'BATTLE',
});

export const FORMAL_RESOURCE_PAYMENT_STATUS = Object.freeze({
  RESOLVED: 'RESOLVED',
  AUTHORITY_UNRESOLVED_INSUFFICIENT_TOTAL: 'AUTHORITY_UNRESOLVED_INSUFFICIENT_TOTAL',
});

export const FORMAL_RESOURCE_PAYMENT_POLICY = 'MANA_ONLY_REQUIRED';
export const FORMAL_MANA_MAX = 10;

function requireNonNegativeInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative integer`);
  }
  return value;
}

function requireMana(value) {
  const mana = requireNonNegativeInteger(value, 'mana');
  if (mana > FORMAL_MANA_MAX) {
    throw new RangeError(`mana must be <= ${FORMAL_MANA_MAX}`);
  }
  return mana;
}

export function getFormalGenericManaCost({ kind, cardNumber } = {}) {
  if (kind === FORMAL_RESOURCE_PAYMENT_KIND.ROAD) return 0;
  if (kind !== FORMAL_RESOURCE_PAYMENT_KIND.BATTLE) {
    throw new TypeError('kind must be ROAD or BATTLE');
  }
  return requireNonNegativeInteger(cardNumber, 'cardNumber');
}

export function projectFormalResourcePayment({ kind, cardNumber, mana, honey } = {}) {
  const manaBefore = requireMana(mana);
  const honeyBefore = requireNonNegativeInteger(honey, 'honey');
  const cost = getFormalGenericManaCost({ kind, cardNumber });

  if (manaBefore < cost) {
    return Object.freeze({
      status: FORMAL_RESOURCE_PAYMENT_STATUS.AUTHORITY_UNRESOLVED_INSUFFICIENT_TOTAL,
      resolved: false,
      reason: 'INSUFFICIENT_MANA',
      cost,
      manaBefore,
      honeyBefore,
      manaPaid: 0,
      honeyPaid: 0,
      manaDeficit: cost - manaBefore,
      paymentPolicy: FORMAL_RESOURCE_PAYMENT_POLICY,
      userChoiceRequired: false,
    });
  }

  return Object.freeze({
    status: FORMAL_RESOURCE_PAYMENT_STATUS.RESOLVED,
    resolved: true,
    cost,
    manaBefore,
    honeyBefore,
    manaPaid: cost,
    honeyPaid: 0,
    manaAfter: manaBefore - cost,
    honeyAfter: honeyBefore,
    paymentPolicy: FORMAL_RESOURCE_PAYMENT_POLICY,
    userChoiceRequired: false,
  });
}
