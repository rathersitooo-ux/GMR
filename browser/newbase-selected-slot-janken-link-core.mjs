function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label}_nonempty_string_required`);
  }
  return value;
}

function requireAssignmentRow(row, index) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new TypeError(`assignment_${index}_object_required`);
  }

  return Object.freeze({
    slotId: requireNonEmptyString(row.slotId, `assignment_${index}_slotId`),
    jankenHand: requireNonEmptyString(row.jankenHand, `assignment_${index}_jankenHand`),
    cardId: requireNonEmptyString(row.cardId, `assignment_${index}_cardId`),
  });
}

/**
 * Projects one authoritative fixed-slot hand3 assignment row into the atomic
 * selection used by the new-base janken flow.
 *
 * The selected janken hand comes only from the selected slot assignment row.
 * Card-native suit is intentionally not an input and is never inferred here.
 */
export function linkSelectedFixedJankenSlot({ assignments, selectedSlotId } = {}) {
  if (!Array.isArray(assignments) || assignments.length !== 3) {
    throw new RangeError('assignments_must_contain_exactly_3_slots');
  }

  const slotId = requireNonEmptyString(selectedSlotId, 'selectedSlotId');
  const rows = assignments.map(requireAssignmentRow);
  const matches = rows.filter((row) => row.slotId === slotId);

  if (matches.length !== 1) {
    throw new RangeError(
      matches.length === 0
        ? 'selected_slot_not_assigned'
        : 'selected_slot_assignment_must_be_unique',
    );
  }

  const selected = matches[0];
  return Object.freeze({
    selectedSlotId: selected.slotId,
    selectedCardId: selected.cardId,
    selectedJankenHand: selected.jankenHand,
  });
}
