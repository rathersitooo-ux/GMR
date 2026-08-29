import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FIRST_STARTER_DECK_IDS,
  createFirstStarterDeck,
} from '../browser/starter-deck-first.mjs';

const EXPECTED = [
  'SP_A', 'SP_2', 'SP_3', 'SP_4', 'SP_5', 'SP_6', 'SP_7', 'SP_8', 'SP_9', 'SP_10', 'SP_J', 'SP_Q', 'SP_K',
  'CL_A', 'CL_2', 'CL_3', 'CL_4', 'CL_5', 'CL_6', 'CL_7', 'CL_8', 'CL_9', 'CL_10',
  'DI_A', 'DI_2', 'DI_3', 'DI_4', 'DI_5', 'DI_6', 'DI_7', 'DI_8', 'DI_9', 'DI_10',
  'HT_A', 'HT_2', 'HT_3', 'HT_4', 'HT_5', 'HT_6', 'HT_7',
];

test('first starter deck is the exact deterministic 40-card set', () => {
  assert.deepEqual(FIRST_STARTER_DECK_IDS, EXPECTED);
  assert.equal(FIRST_STARTER_DECK_IDS.length, 40);
  assert.equal(new Set(FIRST_STARTER_DECK_IDS).size, 40);
});

test('first starter deck has the required suit counts', () => {
  const counts = Object.create(null);
  for (const id of FIRST_STARTER_DECK_IDS) {
    const suit = id.split('_', 1)[0];
    counts[suit] = (counts[suit] ?? 0) + 1;
  }
  assert.deepEqual({ ...counts }, { SP: 13, CL: 10, DI: 10, HT: 7 });
});

test('first starter deck does not contain Luna/GED or unrelated cards', () => {
  assert.equal(FIRST_STARTER_DECK_IDS.some((id) => id.startsWith('DK_')), false);
  assert.equal(FIRST_STARTER_DECK_IDS.some((id) => id.includes('GED')), false);
  assert.equal(FIRST_STARTER_DECK_IDS.every((id) => /^(SP|CL|DI|HT)_(A|[2-9]|10|J|Q|K)$/.test(id)), true);
});

test('factory returns independent mutable copies without exposing the frozen canon', () => {
  assert.equal(Object.isFrozen(FIRST_STARTER_DECK_IDS), true);
  const a = createFirstStarterDeck();
  const b = createFirstStarterDeck();
  assert.deepEqual(a, EXPECTED);
  assert.deepEqual(b, EXPECTED);
  assert.notEqual(a, b);
  a.pop();
  assert.equal(a.length, 39);
  assert.equal(b.length, 40);
  assert.equal(FIRST_STARTER_DECK_IDS.length, 40);
});
