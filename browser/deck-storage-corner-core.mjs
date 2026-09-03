export const DECK_STORAGE_DEFAULTS = Object.freeze({ maxDeckSize: 40 });

function cardId(value) {
  const id = String(value ?? '').trim();
  if (!id) throw new TypeError('CARD_ID_INVALID');
  return id;
}

function stateOf(state = {}) {
  if (!Array.isArray(state.deck) || !Array.isArray(state.storage)) throw new TypeError('STATE_INVALID');
  return { deck: state.deck.map(cardId), storage: state.storage.map(cardId) };
}

function frozen(deck, storage) {
  return Object.freeze({ deck: Object.freeze([...deck]), storage: Object.freeze([...storage]) });
}

export function createDeckStorageState({ deck = [], storage = [] } = {}) {
  return frozen(deck.map(cardId), storage.map(cardId));
}

export function addCardToStorage(state, value) {
  const current = stateOf(state);
  const id = cardId(value);
  return Object.freeze({ ok: true, action: 'storage-add', cardId: id, openStorage: true, state: frozen(current.deck, [...current.storage, id]) });
}

export function removeCardFromStorage(state, value) {
  const current = stateOf(state);
  const id = cardId(value);
  const index = current.storage.indexOf(id);
  if (index < 0) return Object.freeze({ ok: false, action: 'storage-remove', reason: 'not-in-storage', cardId: id, state: frozen(current.deck, current.storage) });
  const storage = [...current.storage];
  storage.splice(index, 1);
  return Object.freeze({ ok: true, action: 'storage-remove', cardId: id, state: frozen(current.deck, storage) });
}

export function removeCardFromDeck(state, value) {
  const current = stateOf(state);
  const id = cardId(value);
  const index = current.deck.indexOf(id);
  if (index < 0) return Object.freeze({ ok: false, action: 'deck-remove', reason: 'not-in-deck', cardId: id, state: frozen(current.deck, current.storage) });
  const deck = [...current.deck];
  deck.splice(index, 1);
  return Object.freeze({ ok: true, action: 'deck-remove', cardId: id, state: frozen(deck, current.storage) });
}

export function moveStorageCardToDeck(state, value, { maxDeckSize = 40, canAdd = null } = {}) {
  const current = stateOf(state);
  const id = cardId(value);
  const index = current.storage.indexOf(id);
  if (index < 0) return Object.freeze({ ok: false, action: 'storage-to-deck', reason: 'not-in-storage', cardId: id, state: frozen(current.deck, current.storage) });
  if (current.deck.length >= maxDeckSize) return Object.freeze({ ok: false, action: 'storage-to-deck', reason: 'deck-full', cardId: id, state: frozen(current.deck, current.storage) });
  const verdict = typeof canAdd === 'function' ? canAdd({ cardId: id, deck: [...current.deck] }) : true;
  if (verdict === false || verdict?.ok === false) return Object.freeze({ ok: false, action: 'storage-to-deck', reason: verdict?.reason ?? 'deck-rule-rejected', cardId: id, state: frozen(current.deck, current.storage) });
  const storage = [...current.storage];
  storage.splice(index, 1);
  return Object.freeze({ ok: true, action: 'storage-to-deck', cardId: id, state: frozen([...current.deck, id], storage) });
}

export function createStorageCornerViewModel(state, { isRoyal, maxDeckSize = DECK_STORAGE_DEFAULTS.maxDeckSize } = {}) {
  if (typeof isRoyal !== 'function') throw new TypeError('IS_ROYAL_REQUIRED');
  if (!Number.isInteger(maxDeckSize) || maxDeckSize <= 0) throw new RangeError('MAX_DECK_SIZE_INVALID');
  const current = stateOf(state);
  const normal = [];
  const royal = [];
  for (const id of current.storage) (isRoyal(id) ? royal : normal).push(id);
  const selectionCount = current.deck.length + current.storage.length;
  const overDeckLimit = selectionCount > maxDeckSize;
  return Object.freeze({
    deckCount: current.deck.length,
    storageCount: current.storage.length,
    selectionCount,
    overDeckLimit,
    maxDeckSize,
    storageButtonLabel: overDeckLimit ? `${selectionCount}/${maxDeckSize}` : `+${current.storage.length}`,
    storageButtonTone: overDeckLimit ? 'overflow' : 'yellow',
    normal: Object.freeze(normal),
    royal: Object.freeze(royal),
    layout: Object.freeze({ normalSide: 'left', royalSide: 'right' }),
  });
}

export function resolveDeckEditorSwipe({ surface, deltaX, deltaY, thresholdPx = 56 } = {}) {
  if (!['collection', 'deck'].includes(surface)) throw new RangeError('SURFACE_INVALID');
  if (![deltaX, deltaY, thresholdPx].every(Number.isFinite) || thresholdPx <= 0) throw new TypeError('SWIPE_INPUT_INVALID');
  if (Math.abs(deltaX) < thresholdPx || Math.abs(deltaX) <= Math.abs(deltaY) * 1.15) return Object.freeze({ action: 'none' });
  if (surface === 'collection') return Object.freeze({ action: deltaX > 0 ? 'deck-add' : 'storage-add' });
  return Object.freeze({ action: deltaX < 0 ? 'deck-remove' : 'none' });
}
