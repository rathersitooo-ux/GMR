export const FORMAL_RESOURCE_PAYMENT_KIND = Object.freeze({
  ROAD: 'ROAD',
  BATTLE: 'BATTLE',
});

export const FORMAL_RESOURCE_PAYMENT_STATUS = Object.freeze({
  RESOLVED: 'RESOLVED',
  INSUFFICIENT_TOTAL: 'INSUFFICIENT_TOTAL',
});

export const FORMAL_RESOURCE_PAYMENT_POLICY = 'MANA_FIRST_HONEY_SHORTFALL_AUTOMATIC';
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

  // The player never chooses whether Honey covers a Mana shortage.
  const manaPaid = Math.min(manaBefore, cost);
  const honeyPaid = cost - manaPaid;

  if (honeyPaid > honeyBefore) {
    return Object.freeze({
      status: FORMAL_RESOURCE_PAYMENT_STATUS.INSUFFICIENT_TOTAL,
      resolved: false,
      reason: 'INSUFFICIENT_COMBINED_RESOURCES',
      cost,
      manaBefore,
      honeyBefore,
      manaPaid: 0,
      honeyPaid: 0,
      manaDeficit: honeyPaid,
      totalDeficit: honeyPaid - honeyBefore,
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
    manaPaid,
    honeyPaid,
    manaAfter: manaBefore - manaPaid,
    honeyAfter: honeyBefore - honeyPaid,
    paymentPolicy: FORMAL_RESOURCE_PAYMENT_POLICY,
    userChoiceRequired: false,
  });
}