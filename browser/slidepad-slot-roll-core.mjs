export const SLIDEPAD_SLOT_ROLL_SCHEMA = 'gameroad.slidepad-slot-roll.v1';

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite`);
  return number;
}

function positive(value, label) {
  const number = finite(value, label);
  if (!(number > 0)) throw new Error(`${label} must be greater than 0`);
  return number;
}

function normalizeItems(items) {
  if (!Array.isArray(items)) throw new Error('items must be an array');
  const seen = new Set();
  const normalized = items.map((item, index) => {
    const source = item && typeof item === 'object' ? item : { id: item };
    const id = String(source.id ?? '').trim();
    if (!id) throw new Error(`items[${index}].id must be non-empty`);
    if (seen.has(id)) throw new Error(`items must have unique ids: ${id}`);
    seen.add(id);
    return Object.freeze({ ...source, id });
  });
  return Object.freeze(normalized);
}

function freezeState(state) {
  return Object.freeze({
    schema: SLIDEPAD_SLOT_ROLL_SCHEMA,
    items: state.items,
    index: state.index,
    itemId: state.items[state.index]?.id ?? null,
    carryPx: state.carryPx,
    totalSteps: state.totalSteps,
    lastDirection: state.lastDirection,
  });
}

export function wrapSlotRollIndex(index, count) {
  const size = Math.trunc(finite(count, 'count'));
  if (size <= 0) return -1;
  const raw = Math.trunc(finite(index, 'index'));
  return ((raw % size) + size) % size;
}

export function createSlotRollState({ items = [], anchorIndex = 0 } = {}) {
  const normalized = normalizeItems(items);
  const index = normalized.length ? wrapSlotRollIndex(anchorIndex, normalized.length) : -1;
  return freezeState({
    items: normalized,
    index,
    carryPx: 0,
    totalSteps: 0,
    lastDirection: 0,
  });
}

export function stepSlotRoll(state, direction) {
  if (!state || state.schema !== SLIDEPAD_SLOT_ROLL_SCHEMA) throw new Error('state must be a Slot Roll state');
  if (state.items.length < 2) return state;
  const sign = Math.sign(finite(direction, 'direction'));
  if (sign === 0) return state;
  return freezeState({
    items: state.items,
    index: wrapSlotRollIndex(state.index + sign, state.items.length),
    carryPx: state.carryPx,
    totalSteps: state.totalSteps + sign,
    lastDirection: sign,
  });
}

export function advanceSlotRollDrag(state, { deltaPx = 0, detentPx } = {}) {
  if (!state || state.schema !== SLIDEPAD_SLOT_ROLL_SCHEMA) throw new Error('state must be a Slot Roll state');
  const delta = finite(deltaPx, 'deltaPx');
  const detent = positive(detentPx, 'detentPx');
  if (state.items.length < 2 || delta === 0) {
    return Object.freeze({ state, detents: Object.freeze([]) });
  }

  let index = state.index;
  let carryPx = state.carryPx + delta;
  let totalSteps = state.totalSteps;
  let lastDirection = state.lastDirection;
  const detents = [];

  while (Math.abs(carryPx) >= detent) {
    const direction = carryPx > 0 ? 1 : -1;
    const fromIndex = index;
    const toIndex = wrapSlotRollIndex(index + direction, state.items.length);
    index = toIndex;
    totalSteps += direction;
    lastDirection = direction;
    carryPx -= direction * detent;
    detents.push(Object.freeze({
      direction,
      fromIndex,
      toIndex,
      fromItemId: state.items[fromIndex]?.id ?? null,
      toItemId: state.items[toIndex]?.id ?? null,
      wrapped: direction > 0 ? toIndex < fromIndex : toIndex > fromIndex,
    }));
  }

  return Object.freeze({
    state: freezeState({ items: state.items, index, carryPx, totalSteps, lastDirection }),
    detents: Object.freeze(detents),
  });
}

export function projectSlotRollWindow(state, { radius = 1 } = {}) {
  if (!state || state.schema !== SLIDEPAD_SLOT_ROLL_SCHEMA) throw new Error('state must be a Slot Roll state');
  if (!state.items.length) return Object.freeze([]);
  const distance = Math.max(0, Math.trunc(finite(radius, 'radius')));
  const projected = [];
  for (let offset = -distance; offset <= distance; offset += 1) {
    const index = wrapSlotRollIndex(state.index + offset, state.items.length);
    projected.push(Object.freeze({
      offset,
      index,
      item: state.items[index],
      itemId: state.items[index].id,
      selected: offset === 0,
    }));
  }
  return Object.freeze(projected);
}

export function resolveSlotRollCommit(state) {
  if (!state || state.schema !== SLIDEPAD_SLOT_ROLL_SCHEMA) throw new Error('state must be a Slot Roll state');
  if (!state.items.length || state.index < 0) return null;
  return Object.freeze({
    index: state.index,
    item: state.items[state.index],
    itemId: state.items[state.index].id,
    totalSteps: state.totalSteps,
    lastDirection: state.lastDirection,
  });
}
