const FIXED_JANKEN_HAND_ORDER = Object.freeze(["ROCK", "SCISSORS", "PAPER"]);

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label}_object_required`);
  }
  return value;
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label}_nonempty_string_required`);
  }
  return value;
}

function validateHand3(hand) {
  if (!Array.isArray(hand) || hand.length !== 3) {
    throw new RangeError("hand_must_contain_exactly_3_cards");
  }

  const ids = hand.map((card, index) => {
    requireObject(card, `hand_${index}`);
    return requireNonEmptyString(card.id, `hand_${index}_id`);
  });
  if (new Set(ids).size !== 3) {
    throw new RangeError("hand_card_ids_must_be_unique");
  }
  return Object.freeze(ids);
}

function validateFixedSlotState(fixedSlotState) {
  requireObject(fixedSlotState, "fixedSlotState");
  const slots = FIXED_JANKEN_HAND_ORDER.map((jankenHand) => {
    const slot = requireObject(fixedSlotState[jankenHand], `fixed_slot_${jankenHand}`);
    const slotId = requireNonEmptyString(slot.slotId, `fixed_slot_${jankenHand}_slotId`);
    const actualJankenHand = requireNonEmptyString(
      slot.jankenHand,
      `fixed_slot_${jankenHand}_jankenHand`,
    );
    if (actualJankenHand !== jankenHand) {
      throw new RangeError(`fixed_slot_${jankenHand}_must_keep_its_janken_identity`);
    }
    return Object.freeze({ slotId, jankenHand });
  });

  if (new Set(slots.map((slot) => slot.slotId)).size !== 3) {
    throw new RangeError("fixed_slot_ids_must_be_unique");
  }
  return Object.freeze(slots);
}

function createPolicyInput(handCardIds, fixedSlots) {
  const slotSnapshot = Object.freeze(fixedSlots.map((slot) => Object.freeze({ ...slot })));
  return Object.freeze({
    handCardIds: Object.freeze([...handCardIds]),
    fixedSlots: slotSnapshot,
  });
}

function validateAssignmentProposal(proposal, handIds) {
  if (!Array.isArray(proposal) || proposal.length !== 3) {
    throw new RangeError("assignment_policy_must_return_3_card_ids_in_fixed_slot_order");
  }
  const cardIds = proposal.map((cardId, index) =>
    requireNonEmptyString(cardId, `assignment_${index}_cardId`),
  );
  if (new Set(cardIds).size !== 3) {
    throw new RangeError("assignment_policy_card_ids_must_be_unique");
  }
  const handIdSet = new Set(handIds);
  if (cardIds.some((cardId) => !handIdSet.has(cardId))) {
    throw new RangeError("assignment_policy_must_use_only_current_hand_card_ids");
  }
  return cardIds;
}

/**
 * Automatically binds exactly three current-hand card identities to the shared
 * fixed ROCK / SCISSORS / PAPER slot state.
 *
 * The assignment rule is deliberately injected. It receives only current card
 * identities plus fixed slot identities, so native card suit never becomes the
 * assigned janken hand by accident. This core has no default policy.
 */
export function autoAssignHand3ToFixedJankenSlots({ hand, fixedSlotState, assignmentPolicy } = {}) {
  const handIds = validateHand3(hand);
  const slots = validateFixedSlotState(fixedSlotState);
  if (typeof assignmentPolicy !== "function") {
    throw new TypeError("assignmentPolicy_required");
  }

  const proposal = assignmentPolicy(createPolicyInput(handIds, slots));
  const cardIdsByFixedSlot = validateAssignmentProposal(proposal, handIds);

  return Object.freeze(
    slots.map((slot, index) =>
      Object.freeze({
        slotId: slot.slotId,
        jankenHand: slot.jankenHand,
        cardId: cardIdsByFixedSlot[index],
      }),
    ),
  );
}
