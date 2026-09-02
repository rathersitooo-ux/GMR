import {
  NEW_BASE_FIXED_JANKEN_SLOT_STATE,
} from './new-base-fixed-janken-slot-state.mjs';

export const NEW_BASE_ROUND_START_JANKEN_SLOT_ASSIGNMENT_SCHEMA =
  'gameroad.new-base-round-start-janken-slot-assignment.v1';

export const NEW_BASE_JANKEN_SUIT_BY_HAND = Object.freeze({
  ROCK: 'CL',
  SCISSORS: 'DI',
  PAPER: 'SP',
});

export const NEW_BASE_ROUND_START_JANKEN_SLOT_STATUS = Object.freeze({
  OCCUPIED: 'OCCUPIED',
  EMPTY_DISABLED: 'EMPTY_DISABLED',
});

const JANKEN_HAND_ORDER = Object.freeze(['ROCK', 'SCISSORS', 'PAPER']);

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty canonical string`);
  }
  return value;
}

function requireHand(hand) {
  if (!Array.isArray(hand)) {
    throw new TypeError('hand must be an array supplied by the current hand authority');
  }

  const ids = new Set();
  const normalized = hand.map((card, index) => {
    if (card == null || typeof card !== 'object' || Array.isArray(card)) {
      throw new TypeError(`hand[${index}] must be a card object`);
    }
    const id = requireNonEmptyString(card.id, `hand[${index}].id`);
    const suit = requireNonEmptyString(card.suit, `hand[${index}].suit`);
    if (ids.has(id)) {
      throw new RangeError(`hand card id must be unique: ${id}`);
    }
    ids.add(id);
    return Object.freeze({ id, suit });
  });

  return Object.freeze(normalized);
}

function requireFixedSlots(fixedSlotState) {
  if (fixedSlotState == null || typeof fixedSlotState !== 'object' || Array.isArray(fixedSlotState)) {
    throw new TypeError('fixedSlotState must be an object');
  }

  const slotIds = new Set();
  return Object.freeze(JANKEN_HAND_ORDER.map((jankenHand) => {
    const slot = fixedSlotState[jankenHand];
    if (slot == null || typeof slot !== 'object' || Array.isArray(slot)) {
      throw new TypeError(`fixedSlotState.${jankenHand} must be an object`);
    }
    const slotId = requireNonEmptyString(slot.slotId, `fixedSlotState.${jankenHand}.slotId`);
    const actualHand = requireNonEmptyString(
      slot.jankenHand,
      `fixedSlotState.${jankenHand}.jankenHand`,
    );
    if (actualHand !== jankenHand) {
      throw new RangeError(`fixedSlotState.${jankenHand} must keep its janken identity`);
    }
    if (slotIds.has(slotId)) {
      throw new RangeError(`fixed janken slot id must be unique: ${slotId}`);
    }
    slotIds.add(slotId);
    return Object.freeze({ slotId, jankenHand });
  }));
}

function pickDuplicateCandidate({
  roundId,
  slot,
  suit,
  candidateCardIds,
  pickDuplicateIndex,
}) {
  if (candidateCardIds.length === 1) return candidateCardIds[0];
  if (typeof pickDuplicateIndex !== 'function') {
    throw new TypeError('pickDuplicateIndex is required when a janken suit has duplicate candidates');
  }

  const request = Object.freeze({
    roundId,
    slotId: slot.slotId,
    jankenHand: slot.jankenHand,
    suit,
    candidateCardIds: Object.freeze([...candidateCardIds]),
    min: 0,
    max: candidateCardIds.length - 1,
  });
  const index = pickDuplicateIndex(request);
  if (!Number.isSafeInteger(index) || index < request.min || index > request.max) {
    throw new RangeError(
      `pickDuplicateIndex must return an integer in [${request.min}, ${request.max}]`,
    );
  }
  return candidateCardIds[index];
}

function freezeSlot(slot) {
  return Object.freeze({
    ...slot,
    candidateCardIds: Object.freeze([...slot.candidateCardIds]),
  });
}

/**
 * Creates the immutable card-bearing ROCK / SCISSORS / PAPER snapshot for one
 * round start.
 *
 * Membership is current suit authority, not the retired exact-hand3 assignment:
 * CL -> ROCK, DI -> SCISSORS, SP -> PAPER. A slot can remain empty. If a suit
 * has duplicate candidates, the caller must inject an authoritative integer
 * chooser. This core never calls Math.random() and never owns entropy.
 *
 * selectedJankenCardIds are stable slot references, not cards removed from the
 * normal hand. ordinaryHandCardIds therefore preserves the complete source hand,
 * including cards referenced by occupied janken slots. The snapshot does not
 * auto-refill or reassign any slot later in the round.
 */
export function createRoundStartJankenSlotAssignment({
  roundId,
  hand,
  pickDuplicateIndex,
  fixedSlotState = NEW_BASE_FIXED_JANKEN_SLOT_STATE,
} = {}) {
  const canonicalRoundId = requireNonEmptyString(roundId, 'roundId');
  const currentHand = requireHand(hand);
  const fixedSlots = requireFixedSlots(fixedSlotState);

  const slots = fixedSlots.map((slot) => {
    const suit = NEW_BASE_JANKEN_SUIT_BY_HAND[slot.jankenHand];
    const candidateCardIds = currentHand
      .filter((card) => card.suit === suit)
      .map((card) => card.id);

    if (candidateCardIds.length === 0) {
      return freezeSlot({
        slotId: slot.slotId,
        jankenHand: slot.jankenHand,
        suit,
        status: NEW_BASE_ROUND_START_JANKEN_SLOT_STATUS.EMPTY_DISABLED,
        selectable: false,
        cardId: null,
        candidateCardIds,
      });
    }

    const cardId = pickDuplicateCandidate({
      roundId: canonicalRoundId,
      slot,
      suit,
      candidateCardIds,
      pickDuplicateIndex,
    });
    return freezeSlot({
      slotId: slot.slotId,
      jankenHand: slot.jankenHand,
      suit,
      status: NEW_BASE_ROUND_START_JANKEN_SLOT_STATUS.OCCUPIED,
      selectable: true,
      cardId,
      candidateCardIds,
    });
  });

  const sourceHandCardIds = currentHand.map((card) => card.id);
  const selectedJankenCardIds = slots
    .filter((slot) => slot.cardId !== null)
    .map((slot) => slot.cardId);
  const ordinaryHandCardIds = [...sourceHandCardIds];

  return Object.freeze({
    schema: NEW_BASE_ROUND_START_JANKEN_SLOT_ASSIGNMENT_SCHEMA,
    roundId: canonicalRoundId,
    slots: Object.freeze(slots),
    sourceHandCardIds: Object.freeze(sourceHandCardIds),
    selectedJankenCardIds: Object.freeze(selectedJankenCardIds),
    ordinaryHandCardIds: Object.freeze(ordinaryHandCardIds),
  });
}

function requireExistingSnapshot(snapshot) {
  if (snapshot == null || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new TypeError('currentSnapshot must be a round-start janken slot snapshot or null');
  }
  if (snapshot.schema !== NEW_BASE_ROUND_START_JANKEN_SLOT_ASSIGNMENT_SCHEMA) {
    throw new TypeError('currentSnapshot schema is not a round-start janken slot assignment');
  }
  requireNonEmptyString(snapshot.roundId, 'currentSnapshot.roundId');
  if (!Object.isFrozen(snapshot)) {
    throw new TypeError('currentSnapshot must be immutable');
  }
  return snapshot;
}

/**
 * Stable projection helper for render/input code. Repeated calls for the same
 * round return the existing snapshot verbatim, so hover/redraw/drag-start cannot
 * reroll a duplicate suit or backfill an empty slot. A new round creates a new
 * snapshot from that round's hand.
 */
export function ensureRoundStartJankenSlotAssignment({
  currentSnapshot = null,
  roundId,
  hand,
  pickDuplicateIndex,
  fixedSlotState = NEW_BASE_FIXED_JANKEN_SLOT_STATE,
} = {}) {
  const canonicalRoundId = requireNonEmptyString(roundId, 'roundId');
  if (currentSnapshot !== null) {
    const existing = requireExistingSnapshot(currentSnapshot);
    if (existing.roundId === canonicalRoundId) return existing;
  }

  return createRoundStartJankenSlotAssignment({
    roundId: canonicalRoundId,
    hand,
    pickDuplicateIndex,
    fixedSlotState,
  });
}
