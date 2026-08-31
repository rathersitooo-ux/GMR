export const HIDDEN_HAND_REGISTRATION_FIELD = 'hiddenHandCardIds';

function assertDeckRecord(deckRecord) {
  if (deckRecord === null || typeof deckRecord !== 'object' || Array.isArray(deckRecord)) {
    throw new TypeError('deckRecord must be an object');
  }
}

function copyCardIds(cardIds) {
  if (!Array.isArray(cardIds)) {
    throw new TypeError(`${HIDDEN_HAND_REGISTRATION_FIELD} must be an array`);
  }

  return cardIds.map((cardId, index) => {
    if (typeof cardId !== 'string' || cardId.trim().length === 0) {
      throw new TypeError(`${HIDDEN_HAND_REGISTRATION_FIELD}[${index}] must be a non-empty string`);
    }
    return cardId;
  });
}

export function readHiddenHandRegistration(deckRecord) {
  assertDeckRecord(deckRecord);

  if (!Object.prototype.hasOwnProperty.call(deckRecord, HIDDEN_HAND_REGISTRATION_FIELD)) {
    return { present: false, cardIds: [] };
  }

  return {
    present: true,
    cardIds: copyCardIds(deckRecord[HIDDEN_HAND_REGISTRATION_FIELD]),
  };
}

export function withHiddenHandRegistration(deckRecord, cardIds) {
  assertDeckRecord(deckRecord);
  const registrationCardIds = copyCardIds(cardIds);

  return {
    ...deckRecord,
    [HIDDEN_HAND_REGISTRATION_FIELD]: registrationCardIds,
  };
}
