import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBattleJankenSlidePadModel,
  projectBattleLoadCardPreview,
} from '../browser/battle-janken-slidepad-runtime-mount.mjs';

const hand = [
  { id: 'club-a', suit: 'CL', label: 'Club A' },
  { id: 'club-b', suit: 'CL', label: 'Club B' },
  { id: 'diamond-a', suit: 'DI', label: 'Diamond A' },
  { id: 'spade-a', suit: 'SP', label: 'Spade A' },
];

test('R75 preview exists only for the actually armed selectable janken slot', () => {
  const model = buildBattleJankenSlidePadModel({
    roundId: '7',
    hand,
    pickDuplicateIndex: () => 1,
  });

  assert.equal(projectBattleLoadCardPreview(model, null), null);
  assert.equal(projectBattleLoadCardPreview(model, 'HEART'), null);
  assert.deepEqual(projectBattleLoadCardPreview(model, 'ROCK'), {
    kind: 'LOAD_CARD',
    cardId: 'club-b',
    cardLabel: 'Club B',
    jankenHand: 'ROCK',
    symbol: '♣',
    hand: 'グー',
  });
});

test('R75 preview fails closed for empty or disabled slots', () => {
  const model = buildBattleJankenSlidePadModel({
    roundId: '8',
    hand: [{ id: 'club-only', suit: 'CL', label: 'Club' }],
  });

  assert.equal(projectBattleLoadCardPreview(model, 'SCISSORS'), null);
  assert.equal(projectBattleLoadCardPreview(model, 'PAPER'), null);
});
