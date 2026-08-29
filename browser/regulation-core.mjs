export const GED_CARD_ID = 'GED';

export const CURRENT_REGULATION_BLOCKED_CARD_IDS = Object.freeze([
  GED_CARD_ID,
]);

export function isCardBlockedByCurrentRegulation(cardId) {
  if (typeof cardId !== 'string' || cardId.trim() === '') {
    throw new TypeError('cardId must be a non-empty string');
  }
  return CURRENT_REGULATION_BLOCKED_CARD_IDS.includes(cardId);
}
