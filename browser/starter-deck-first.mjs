export const FIRST_STARTER_DECK_IDS = Object.freeze([
  'SP_A', 'SP_2', 'SP_3', 'SP_4', 'SP_5', 'SP_6', 'SP_7', 'SP_8', 'SP_9', 'SP_10', 'SP_J', 'SP_Q', 'SP_K',
  'CL_A', 'CL_2', 'CL_3', 'CL_4', 'CL_5', 'CL_6', 'CL_7', 'CL_8', 'CL_9', 'CL_10',
  'DI_A', 'DI_2', 'DI_3', 'DI_4', 'DI_5', 'DI_6', 'DI_7', 'DI_8', 'DI_9', 'DI_10',
  'HT_A', 'HT_2', 'HT_3', 'HT_4', 'HT_5', 'HT_6', 'HT_7',
]);

export function createFirstStarterDeck() {
  return [...FIRST_STARTER_DECK_IDS];
}
