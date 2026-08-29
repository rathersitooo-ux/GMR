export const DECK_SLOT_COUNT = 12;
export const DEFAULT_SELECTED_DECK_INDEX = 0;
export const DEFAULT_SELECTED_DECK_NUMBER = 1;
export const DEFAULT_SELECTION_STORAGE_KEY = 'gameroad:selectedDeckIndex';

export function isValidDeckIndex(value) {
  return Number.isInteger(value) && value >= 0 && value < DECK_SLOT_COUNT;
}

export function isValidDeckNumber(value) {
  return Number.isInteger(value) && value >= 1 && value <= DECK_SLOT_COUNT;
}

export function deckNumberToIndex(deckNumber) {
  if (!isValidDeckNumber(deckNumber)) {
    throw new RangeError(`deckNumber must be 1..${DECK_SLOT_COUNT}`);
  }
  return deckNumber - 1;
}

export function deckIndexToNumber(deckIndex) {
  if (!isValidDeckIndex(deckIndex)) {
    throw new RangeError(`deckIndex must be 0..${DECK_SLOT_COUNT - 1}`);
  }
  return deckIndex + 1;
}

function readPersistedIndex(storage, storageKey) {
  if (!storage || typeof storage.getItem !== 'function') {
    return DEFAULT_SELECTED_DECK_INDEX;
  }
  try {
    const raw = storage.getItem(storageKey);
    if (raw == null || raw === '') return DEFAULT_SELECTED_DECK_INDEX;
    const parsed = Number(raw);
    return isValidDeckIndex(parsed) ? parsed : DEFAULT_SELECTED_DECK_INDEX;
  } catch {
    return DEFAULT_SELECTED_DECK_INDEX;
  }
}

function persistIndex(storage, storageKey, deckIndex) {
  if (!storage || typeof storage.setItem !== 'function') return;
  try {
    storage.setItem(storageKey, String(deckIndex));
  } catch {
    // Selection still works in-memory when persistence is unavailable.
  }
}

export function createDeckSelectionController({
  storage = null,
  storageKey = DEFAULT_SELECTION_STORAGE_KEY,
} = {}) {
  let selectedDeckIndex = readPersistedIndex(storage, storageKey);

  const snapshot = () => Object.freeze({
    selectedDeckIndex,
    selectedDeckNumber: deckIndexToNumber(selectedDeckIndex),
  });

  return Object.freeze({
    snapshot,
    selectDeckIndex(deckIndex) {
      if (!isValidDeckIndex(deckIndex)) {
        throw new RangeError(`deckIndex must be 0..${DECK_SLOT_COUNT - 1}`);
      }
      selectedDeckIndex = deckIndex;
      persistIndex(storage, storageKey, selectedDeckIndex);
      return snapshot();
    },
    selectDeckNumber(deckNumber) {
      selectedDeckIndex = deckNumberToIndex(deckNumber);
      persistIndex(storage, storageKey, selectedDeckIndex);
      return snapshot();
    },
  });
}
