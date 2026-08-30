import { resolveDeckEditorSwipe } from './deck-storage-corner-core.mjs';

function requiredAuthority(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name}_REQUIRED`);
  return value;
}

function normalizeCardId(value) {
  const id = String(value ?? '').trim();
  if (!id) throw new TypeError('CARD_ID_INVALID');
  return id;
}

function normalizeThreshold(value) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError('THRESHOLD_PX_INVALID');
  return value;
}

export function createDeckStorageGestureRuntime({
  addDeckCard,
  removeDeckCard,
  addStorageCard,
  thresholdPx = 56,
} = {}) {
  const authorities = Object.freeze({
    'deck-add': requiredAuthority(addDeckCard, 'ADD_DECK_CARD'),
    'deck-remove': requiredAuthority(removeDeckCard, 'REMOVE_DECK_CARD'),
    'storage-add': requiredAuthority(addStorageCard, 'ADD_STORAGE_CARD'),
  });
  const threshold = normalizeThreshold(thresholdPx);

  return Object.freeze({
    handleSwipe({ surface, cardId: value, deltaX, deltaY } = {}) {
      const cardId = normalizeCardId(value);
      const decision = resolveDeckEditorSwipe({ surface, deltaX, deltaY, thresholdPx: threshold });
      if (decision.action === 'none') {
        return Object.freeze({ handled: false, action: 'none', cardId, authorityResult: null });
      }

      const authority = authorities[decision.action];
      if (!authority) throw new RangeError('DECK_STORAGE_ACTION_UNSUPPORTED');
      const context = Object.freeze({
        action: decision.action,
        surface,
        deltaX,
        deltaY,
      });
      const authorityResult = authority(cardId, context);
      return Object.freeze({
        handled: true,
        action: decision.action,
        cardId,
        authorityResult,
      });
    },
  });
}
