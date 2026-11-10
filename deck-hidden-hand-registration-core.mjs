export const HIDDEN_HAND_REGISTRATION_FIELD = 'hiddenHandCardIds';
export const DECK_HIDDEN_HAND_REGISTRATION_SCHEMA = 'gameroad.deck-hidden-hand-registration.v1';

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function assertDeckRecord(deckRecord) {
  if (!deckRecord || typeof deckRecord !== 'object' || Array.isArray(deckRecord)) {
    throw new TypeError('HIDDEN_HAND_DECK_RECORD_REQUIRED');
  }
  if (!Array.isArray(deckRecord.main)) {
    throw new TypeError('HIDDEN_HAND_MAIN_DECK_REQUIRED');
  }
  for (const cardId of deckRecord.main) {
    if (!nonEmptyString(cardId)) throw new TypeError('HIDDEN_HAND_MAIN_DECK_CARD_ID_INVALID');
  }
  return deckRecord;
}

function normalizeRegisteredCardId(deckRecord) {
  const ids = deckRecord[HIDDEN_HAND_REGISTRATION_FIELD];
  if (!Array.isArray(ids) || ids.length !== 1 || !nonEmptyString(ids[0])) {
    throw new TypeError('HIDDEN_HAND_REGISTRATION_EXACT_ONE_REQUIRED');
  }
  const cardId = ids[0].trim();
  if (!deckRecord.main.includes(cardId)) {
    throw new TypeError('HIDDEN_HAND_REGISTERED_CARD_NOT_IN_MAIN_DECK');
  }
  return cardId;
}

export function readDeckHiddenHandRegistration(deckRecord) {
  const deck = assertDeckRecord(deckRecord);
  if (!Object.prototype.hasOwnProperty.call(deck, HIDDEN_HAND_REGISTRATION_FIELD)) {
    return Object.freeze({ present: false, cardId: null });
  }
  const cardId = normalizeRegisteredCardId(deck);
  return Object.freeze({ present: true, cardId });
}

export function withDeckHiddenHandRegistration(deckRecord, selectedCardId) {
  const deck = assertDeckRecord(deckRecord);
  if (!nonEmptyString(selectedCardId)) {
    throw new TypeError('HIDDEN_HAND_SELECTED_CARD_ID_REQUIRED');
  }
  const cardId = selectedCardId.trim();
  if (!deck.main.includes(cardId)) {
    throw new TypeError('HIDDEN_HAND_SELECTED_CARD_NOT_IN_MAIN_DECK');
  }
  return {
    ...deck,
    main: [...deck.main],
    ...(Array.isArray(deck.ex) ? { ex: [...deck.ex] } : {}),
    [HIDDEN_HAND_REGISTRATION_FIELD]: [cardId],
  };
}

export function createDeckHiddenHandRegistrationSnapshot(deckRecord) {
  const deck = assertDeckRecord(deckRecord);
  const registration = readDeckHiddenHandRegistration(deck);
  if (registration.present !== true || !registration.cardId) {
    throw new TypeError('HIDDEN_HAND_REGISTRATION_REQUIRED');
  }
  return Object.freeze({
    schema: DECK_HIDDEN_HAND_REGISTRATION_SCHEMA,
    cardId: registration.cardId,
    sourceMainCardIds: Object.freeze([...deck.main]),
  });
}
