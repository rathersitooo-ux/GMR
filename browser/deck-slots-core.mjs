export const DECK_SLOT_COUNT = 12;
export const DECK_SLOTS_SCHEMA = 'gameroad.deck-slots.v1';

function assertSlotIndex(index) {
  if (!Number.isInteger(index) || index < 0 || index >= DECK_SLOT_COUNT) {
    throw new RangeError(`DECK_SLOT_INDEX_OUT_OF_RANGE:${index}`);
  }
}

function cloneValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function freezeValue(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freezeValue(child);
  return value;
}

function freezeState(slots) {
  return freezeValue({
    schema: DECK_SLOTS_SCHEMA,
    slots,
  });
}

export function createDeckSlots({ slots = [] } = {}) {
  if (!Array.isArray(slots)) throw new TypeError('DECK_SLOTS_ARRAY_REQUIRED');
  if (slots.length > DECK_SLOT_COUNT) throw new RangeError('DECK_SLOTS_TOO_MANY');

  const normalized = Array.from({ length: DECK_SLOT_COUNT }, (_, index) =>
    index < slots.length ? cloneValue(slots[index]) : null,
  );
  return freezeState(normalized);
}

export function getDeckSlot(state, index) {
  assertDeckSlotsState(state);
  assertSlotIndex(index);
  return state.slots[index];
}

export function setDeckSlot(state, index, value) {
  assertDeckSlotsState(state);
  assertSlotIndex(index);
  const slots = state.slots.map((slot, slotIndex) =>
    slotIndex === index ? cloneValue(value) : cloneValue(slot),
  );
  return freezeState(slots);
}

export function clearDeckSlot(state, index) {
  return setDeckSlot(state, index, null);
}

export function assertDeckSlotsState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError('DECK_SLOTS_STATE_REQUIRED');
  }
  if (state.schema !== DECK_SLOTS_SCHEMA) throw new TypeError('DECK_SLOTS_SCHEMA_UNSUPPORTED');
  if (!Array.isArray(state.slots) || state.slots.length !== DECK_SLOT_COUNT) {
    throw new TypeError('DECK_SLOTS_COUNT_INVALID');
  }
  return state;
}

export const DECK_SLOTS_CORE = Object.freeze({
  schema: DECK_SLOTS_SCHEMA,
  slotCount: DECK_SLOT_COUNT,
});
