export const NEW_BASE_BATTLE_PLAN_PRESENTATION_SCHEMA = 'gameroad.new-base-battle-plan.presentation.v1';

const REQUIRED_JANKEN_HANDS = Object.freeze(['ROCK', 'SCISSORS', 'PAPER']);
const AUTHORITY = deepFreeze({
  presentationOnly: true,
  gameStateWrite: false,
  diceAuthority: false,
  movementAuthority: false,
  manaAuthority: false,
  battleAuthority: false,
  jankenAuthority: false,
  boardAuthority: false,
  cameraMutatesLogicalState: false,
});

function invariant(condition, message) {
  if (!condition) throw new TypeError(message);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneRecord(value) {
  if (!isObject(value)) return null;
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (Array.isArray(entry)) out[key] = entry.map((item) => (isObject(item) ? cloneRecord(item) : item));
    else if (isObject(entry)) out[key] = cloneRecord(entry);
    else out[key] = entry;
  }
  return out;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const entry of Object.values(value)) deepFreeze(entry);
  return value;
}

function normalizeFixedSlots(fixedSlots) {
  invariant(Array.isArray(fixedSlots) && fixedSlots.length === 3, 'fixedSlots must contain exactly three slots');
  const seenSlots = new Set();
  const seenHands = new Set();
  const normalized = fixedSlots.map((slot) => {
    invariant(isObject(slot), 'fixed slot must be an object');
    invariant(typeof slot.slotId === 'string' && slot.slotId.length > 0, 'fixed slot requires slotId');
    invariant(REQUIRED_JANKEN_HANDS.includes(slot.jankenHand), 'fixed slot jankenHand must be ROCK, SCISSORS, or PAPER');
    invariant(!seenSlots.has(slot.slotId), 'fixed slot IDs must be unique');
    invariant(!seenHands.has(slot.jankenHand), 'fixed slot janken hands must be unique');
    seenSlots.add(slot.slotId);
    seenHands.add(slot.jankenHand);
    return { slotId: slot.slotId, jankenHand: slot.jankenHand };
  });
  invariant(REQUIRED_JANKEN_HANDS.every((hand) => seenHands.has(hand)), 'fixed slots must cover ROCK, SCISSORS, and PAPER');
  return normalized;
}

function normalizeAssignments(assignments, slotById) {
  invariant(Array.isArray(assignments) && assignments.length === 3, 'assignments must contain exactly three entries');
  const bySlot = new Map();
  const seenCards = new Set();
  for (const assignment of assignments) {
    invariant(isObject(assignment), 'assignment must be an object');
    invariant(typeof assignment.slotId === 'string' && slotById.has(assignment.slotId), 'assignment references unknown slotId');
    const slot = slotById.get(assignment.slotId);
    invariant(assignment.jankenHand === slot.jankenHand, 'assignment jankenHand must match fixed slot');
    invariant(typeof assignment.cardId === 'string' && assignment.cardId.length > 0, 'assignment requires cardId');
    invariant(!bySlot.has(assignment.slotId), 'each fixed slot must have exactly one assignment');
    invariant(!seenCards.has(assignment.cardId), 'each hand card must be assigned once');
    bySlot.set(assignment.slotId, { slotId: assignment.slotId, jankenHand: assignment.jankenHand, cardId: assignment.cardId });
    seenCards.add(assignment.cardId);
  }
  invariant(bySlot.size === 3, 'all fixed slots must be assigned');
  return bySlot;
}

function normalizeCards(cards) {
  invariant(Array.isArray(cards) && cards.length === 3, 'cards must contain exactly three presentation records');
  const byId = new Map();
  for (const card of cards) {
    invariant(isObject(card), 'card presentation record must be an object');
    invariant(typeof card.cardId === 'string' && card.cardId.length > 0, 'card presentation record requires cardId');
    invariant(!byId.has(card.cardId), 'card presentation IDs must be unique');
    byId.set(card.cardId, {
      cardId: card.cardId,
      intrinsicSuit: card.intrinsicSuit ?? null,
      label: card.label ?? null,
      artRef: card.artRef ?? null,
    });
  }
  return byId;
}

function normalizeSelection(selectedSlotId, selectedCardId, assignmentBySlot) {
  const hasSlot = selectedSlotId !== null && selectedSlotId !== undefined;
  const hasCard = selectedCardId !== null && selectedCardId !== undefined;
  invariant(hasSlot === hasCard, 'selectedSlotId and selectedCardId must be supplied together');
  if (!hasSlot) return null;
  invariant(typeof selectedSlotId === 'string' && typeof selectedCardId === 'string', 'selected slot/card IDs must be strings');
  const assignment = assignmentBySlot.get(selectedSlotId);
  invariant(assignment && assignment.cardId === selectedCardId, 'selected card must match the selected fixed-slot assignment');
  return { selectedSlotId, selectedCardId };
}

function normalizeMana(mana) {
  if (mana === null || mana === undefined) return null;
  invariant(isObject(mana), 'mana must be an object');
  const recoveryStatus = mana.recoveryStatus ?? null;
  if (recoveryStatus === 'UNDECIDED') {
    invariant(mana.recoveryAmount === null || mana.recoveryAmount === undefined, 'UNDECIDED mana recovery cannot carry a numeric amount');
  }
  return {
    current: mana.current ?? null,
    max: mana.max ?? null,
    recoveryStatus,
    recoveryAmount: recoveryStatus === 'UNDECIDED' ? null : (mana.recoveryAmount ?? null),
  };
}

function normalizeBoard(board) {
  if (board === null || board === undefined) return null;
  invariant(isObject(board), 'board must be an object');
  const zonePositionIds = isObject(board.zonePositionIds) ? board.zonePositionIds : {};
  const zones = {};
  for (const [zoneId, ids] of Object.entries(zonePositionIds)) {
    invariant(Array.isArray(ids), `board zone ${zoneId} must be an array of position IDs`);
    zones[zoneId] = ids.map((id) => {
      invariant(typeof id === 'string' && id.length > 0, `board zone ${zoneId} contains invalid position ID`);
      return id;
    });
  }
  return {
    schemaVersion: board.schemaVersion ?? null,
    zones,
    validPositionIds: Array.isArray(board.validPositionIds) ? [...board.validPositionIds] : [],
  };
}

export function projectNewBaseBattlePlanPresentation(input = {}) {
  invariant(isObject(input), 'input must be an object');
  if (input.enabled !== true) {
    return deepFreeze({
      schemaVersion: NEW_BASE_BATTLE_PLAN_PRESENTATION_SCHEMA,
      active: false,
      authority: AUTHORITY,
    });
  }

  const fixedSlots = normalizeFixedSlots(input.fixedSlots);
  const slotById = new Map(fixedSlots.map((slot) => [slot.slotId, slot]));
  const assignmentBySlot = normalizeAssignments(input.assignments, slotById);
  const cardsById = normalizeCards(input.cards);
  const selection = normalizeSelection(input.selectedSlotId, input.selectedCardId, assignmentBySlot);

  const slots = fixedSlots.map((slot) => {
    const assignment = assignmentBySlot.get(slot.slotId);
    const card = cardsById.get(assignment.cardId);
    invariant(card, `assignment references unknown cardId: ${assignment.cardId}`);
    return {
      slotId: slot.slotId,
      jankenHand: slot.jankenHand,
      card,
      selected: Boolean(selection && selection.selectedSlotId === slot.slotId && selection.selectedCardId === assignment.cardId),
    };
  });

  return deepFreeze({
    schemaVersion: NEW_BASE_BATTLE_PLAN_PRESENTATION_SCHEMA,
    active: true,
    authority: AUTHORITY,
    turn: cloneRecord(input.turn),
    slots,
    dice: cloneRecord(input.dice),
    movementBudget: cloneRecord(input.movementBudget),
    mana: normalizeMana(input.mana),
    board: normalizeBoard(input.board),
    camera: cloneRecord(input.camera),
  });
}
