export const NEW_BASE_FIXED_JANKEN_SLOT_IDS = Object.freeze({
  ROCK: 'ROCK',
  SCISSORS: 'SCISSORS',
  PAPER: 'PAPER',
});

export const NEW_BASE_FIXED_JANKEN_SLOT_STATE = Object.freeze({
  ROCK: Object.freeze({
    slotId: NEW_BASE_FIXED_JANKEN_SLOT_IDS.ROCK,
    jankenHand: NEW_BASE_FIXED_JANKEN_SLOT_IDS.ROCK,
  }),
  SCISSORS: Object.freeze({
    slotId: NEW_BASE_FIXED_JANKEN_SLOT_IDS.SCISSORS,
    jankenHand: NEW_BASE_FIXED_JANKEN_SLOT_IDS.SCISSORS,
  }),
  PAPER: Object.freeze({
    slotId: NEW_BASE_FIXED_JANKEN_SLOT_IDS.PAPER,
    jankenHand: NEW_BASE_FIXED_JANKEN_SLOT_IDS.PAPER,
  }),
});
