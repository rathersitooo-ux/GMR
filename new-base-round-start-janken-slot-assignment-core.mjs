import {
  NEW_BASE_FIXED_JANKEN_SLOT_STATE,
} from './new-base-fixed-janken-slot-state.mjs';

export const NEW_BASE_ROUND_START_JANKEN_SLOT_ASSIGNMENT_SCHEMA =
  'gameroad.new-base-round-start-janken-slot-assignment.v1';

export const NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE = Object.freeze({
  CURRENT_HAND3_POLICY: 'CURRENT_HAND3_POLICY',
  LEGACY_SUIT_BOUND: 'LEGACY_SUIT_BOUND',
});

// Compatibility-only mapping for the currently mounted legacy caller. The
// current new-base rule does not use native suit to decide janken membership.
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

function requireAssignmentMode(value) {
  if (Object.values(NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE).includes(value)) return value;
  throw new RangeError('assignmentMode must be CURRENT_HAND3_POLICY or LEGACY_SUIT_BOUND');
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

function createLegacySuitBoundSlots({
  canonicalRoundId,
  currentHand,
  fixedSlots,
  pickDuplicateIndex,
}) {
  return fixedSlots.map((slot) => {
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
}

function requireCurrentHand3PolicyResult(assignedCardIdsByJankenHand, currentHand) {
  if (currentHand.length !== JANKEN_HAND_ORDER.length) {
    throw new RangeError('CURRENT_HAND3_POLICY requires exactly 3 current hand cards');
  }
  if (
    assignedCardIdsByJankenHand == null
    || typeof assignedCardIdsByJankenHand !== 'object'
    || Array.isArray(assignedCardIdsByJankenHand)
  ) {
    throw new TypeError(
      'assignedCardIdsByJankenHand must be supplied by the external auto-assignment policy',
    );
  }

  const currentIds = new Set(currentHand.map((card) => card.id));
  const assignedIds = JANKEN_HAND_ORDER.map((jankenHand) => requireNonEmptyString(
    assignedCardIdsByJankenHand[jankenHand],
    `assignedCardIdsByJankenHand.${jankenHand}`,
  ));
  const uniqueAssigned = new Set(assignedIds);
  if (uniqueAssigned.size !== JANKEN_HAND_ORDER.length) {
    throw new RangeError('CURRENT_HAND3_POLICY must assign three distinct physical cards');
  }
  for (const cardId of assignedIds) {
    if (!currentIds.has(cardId)) {
      throw new RangeError(`assigned janken card is not in the current hand: ${cardId}`);
    }
  }
  if (assignedIds.some((cardId) => !currentIds.has(cardId)) || currentIds.size !== uniqueAssigned.size) {
    throw new RangeError('CURRENT_HAND3_POLICY must assign every current hand card exactly once');
  }

  return Object.freeze(Object.fromEntries(
    JANKEN_HAND_ORDER.map((jankenHand, index) => [jankenHand, assignedIds[index]]),
  ));
}

function createCurrentHand3PolicySlots({ currentHand, fixedSlots, assignedCardIdsByJankenHand }) {
  const assignment = requireCurrentHand3PolicyResult(assignedCardIdsByJankenHand, currentHand);
  const cardById = new Map(currentHand.map((card) => [card.id, card]));
  return fixedSlots.map((slot) => {
    const cardId = assignment[slot.jankenHand];
    const card = cardById.get(cardId);
    return freezeSlot({
      slotId: slot.slotId,
      jankenHand: slot.jankenHand,
      status: NEW_BASE_ROUND_START_JANKEN_SLOT_STATUS.OCCUPIED,
      selectable: true,
      cardId,
      nativeSuit: card.suit,
      candidateCardIds: [cardId],
    });
  });
}

/**
 * Creates the immutable card-bearing ROCK / SCISSORS / PAPER snapshot for one
 * round start.
 *
 * CURRENT_HAND3_POLICY is the current new-base contract surface: the current
 * hand must contain exactly three physical cards, all three fixed janken slots
 * must be occupied, and every source card must be assigned exactly once. Native
 * card suit is preserved as nativeSuit and does not determine slot membership.
 * The exact auto-assignment policy is intentionally external: this core only
 * validates the policy result and does not invent order/suit/random/strength
 * semantics that the user has not fixed.
 *
 * LEGACY_SUIT_BOUND remains only as a migration seam for the already-mounted
 * caller until that caller can be switched without breaking the live Battle.
 * It preserves the previous CL/DI/SP membership, empty-slot and duplicate-choice
 * behavior and must not be treated as the current new-base game rule.
 *
 * A selected physical card belongs to exactly one player-facing zone at a time.
 * sourceHandCardIds keeps the immutable round source identities so slot input can
 * reach the same authoritative card action without creating a second hand or
 * execution engine. This snapshot never auto-refills or reassigns later in the
 * same round.
 */
export function createRoundStartJankenSlotAssignment({
  roundId,
  hand,
  assignmentMode = NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE.LEGACY_SUIT_BOUND,
  assignedCardIdsByJankenHand = null,
  pickDuplicateIndex,
  fixedSlotState = NEW_BASE_FIXED_JANKEN_SLOT_STATE,
} = {}) {
  const canonicalRoundId = requireNonEmptyString(roundId, 'roundId');
  const currentHand = requireHand(hand);
  const fixedSlots = requireFixedSlots(fixedSlotState);
  const mode = requireAssignmentMode(assignmentMode);

  const slots = mode === NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE.CURRENT_HAND3_POLICY
    ? createCurrentHand3PolicySlots({ currentHand, fixedSlots, assignedCardIdsByJankenHand })
    : createLegacySuitBoundSlots({
      canonicalRoundId,
      currentHand,
      fixedSlots,
      pickDuplicateIndex,
    });

  const sourceHandCardIds = currentHand.map((card) => card.id);
  const selectedJankenCardIds = slots
    .filter((slot) => slot.cardId !== null)
    .map((slot) => slot.cardId);
  const selectedSet = new Set(selectedJankenCardIds);
  const ordinaryHandCardIds = sourceHandCardIds.filter((cardId) => !selectedSet.has(cardId));

  return Object.freeze({
    schema: NEW_BASE_ROUND_START_JANKEN_SLOT_ASSIGNMENT_SCHEMA,
    assignmentMode: mode,
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
 * round return the existing snapshot verbatim. A caller may not silently switch
 * assignment modes inside the same round; that would reassign physical cards
 * after the immutable round snapshot has already been established.
 */
export function ensureRoundStartJankenSlotAssignment({
  currentSnapshot = null,
  roundId,
  hand,
  assignmentMode = NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE.LEGACY_SUIT_BOUND,
  assignedCardIdsByJankenHand = null,
  pickDuplicateIndex,
  fixedSlotState = NEW_BASE_FIXED_JANKEN_SLOT_STATE,
} = {}) {
  const canonicalRoundId = requireNonEmptyString(roundId, 'roundId');
  const mode = requireAssignmentMode(assignmentMode);
  if (currentSnapshot !== null) {
    const existing = requireExistingSnapshot(currentSnapshot);
    if (existing.roundId === canonicalRoundId) {
      const existingMode = existing.assignmentMode
        ?? NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE.LEGACY_SUIT_BOUND;
      if (existingMode !== mode) {
        throw new RangeError('assignmentMode cannot change inside an existing round snapshot');
      }
      return existing;
    }
  }

  return createRoundStartJankenSlotAssignment({
    roundId: canonicalRoundId,
    hand,
    assignmentMode: mode,
    assignedCardIdsByJankenHand,
    pickDuplicateIndex,
    fixedSlotState,
  });
}
