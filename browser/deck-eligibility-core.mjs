export const DECK_ELIGIBILITY_STATUS = Object.freeze({
  USABLE: 'USABLE',
  CARD_COUNT_SHORT: 'CARD_COUNT_SHORT',
  CARD_COUNT_OVER: 'CARD_COUNT_OVER',
  REGULATION_CARD_BLOCKED: 'REGULATION_CARD_BLOCKED',
  DECK_INPUT_UNREADABLE: 'DECK_INPUT_UNREADABLE',
});

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value)))];
}

export function classifyDeckEligibility({
  deck,
  requiredMain = 40,
  blockedCardIds = [],
} = {}) {
  if (!Number.isInteger(requiredMain) || requiredMain < 0) {
    throw new TypeError('requiredMain must be a non-negative integer');
  }
  if (!Array.isArray(blockedCardIds)) {
    throw new TypeError('blockedCardIds must be an array');
  }
  if (!deck || !Array.isArray(deck.main) || (deck.ex != null && !Array.isArray(deck.ex))) {
    return {
      usable: false,
      status: DECK_ELIGIBILITY_STATUS.DECK_INPUT_UNREADABLE,
      reasons: [{ code: DECK_ELIGIBILITY_STATUS.DECK_INPUT_UNREADABLE }],
      mainCount: 0,
      requiredMain,
      missingCount: requiredMain,
      excessCount: 0,
      blockedCardIds: [],
    };
  }

  const mainIds = deck.main.map((id) => String(id));
  const exIds = Array.isArray(deck.ex) ? deck.ex.map((id) => String(id)) : [];
  const allIds = [...mainIds, ...exIds];
  const blockedSet = new Set(blockedCardIds.map((id) => String(id)));
  const blocked = uniqueStrings(allIds.filter((id) => blockedSet.has(id)));
  const mainCount = mainIds.length;
  const missingCount = Math.max(0, requiredMain - mainCount);
  const excessCount = Math.max(0, mainCount - requiredMain);
  const reasons = [];

  if (missingCount > 0) {
    reasons.push({
      code: DECK_ELIGIBILITY_STATUS.CARD_COUNT_SHORT,
      missingCount,
      mainCount,
      requiredMain,
    });
  } else if (excessCount > 0) {
    reasons.push({
      code: DECK_ELIGIBILITY_STATUS.CARD_COUNT_OVER,
      excessCount,
      mainCount,
      requiredMain,
    });
  }

  if (blocked.length > 0) {
    reasons.push({
      code: DECK_ELIGIBILITY_STATUS.REGULATION_CARD_BLOCKED,
      cardIds: blocked,
    });
  }

  return {
    usable: reasons.length === 0,
    status: reasons[0]?.code ?? DECK_ELIGIBILITY_STATUS.USABLE,
    reasons,
    mainCount,
    requiredMain,
    missingCount,
    excessCount,
    blockedCardIds: blocked,
  };
}
