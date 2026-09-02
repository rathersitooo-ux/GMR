import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_JANKEN_SLIDEPAD_RUNTIME_SCHEMA,
  buildBattleJankenSlidePadModel,
  resolveBattleJankenSlotCardAction,
} from '../browser/battle-janken-slidepad-runtime-mount.mjs';

const hand = [
  { id: 'club-a', suit: 'CL', label: 'Club A' },
  { id: 'diamond-a', suit: 'DI', label: 'Diamond A' },
  { id: 'spade-a', suit: 'SP', label: 'Spade A' },
  { id: 'club-b', suit: 'CL', label: 'Club B' },
];

test('projects the existing suit-bound round snapshot as ROCK/SCISSORS/PAPER without removing ordinary hand cards', () => {
  const model = buildBattleJankenSlidePadModel({ roundId: '1', hand, pickDuplicateIndex: () => 1 });
  assert.equal(model.schema, BATTLE_JANKEN_SLIDEPAD_RUNTIME_SCHEMA);
  assert.deepEqual(model.slots.map((slot) => [slot.jankenHand, slot.cardId]), [
    ['ROCK', 'club-b'],
    ['SCISSORS', 'diamond-a'],
    ['PAPER', 'spade-a'],
  ]);
  assert.deepEqual(model.ordinaryHandCardIds, hand.map((card) => card.id));
  assert.equal(resolveBattleJankenSlotCardAction(model, 'ROCK', model.ordinaryHandCardIds), 'club-b');
});

test('same-round redraw keeps the immutable slot assignment even if duplicate chooser would change', () => {
  const first = buildBattleJankenSlidePadModel({ roundId: '5', hand, pickDuplicateIndex: () => 0 });
  const second = buildBattleJankenSlidePadModel({
    roundId: '5',
    hand,
    currentSnapshot: first.assignment,
    pickDuplicateIndex: () => 1,
  });
  assert.strictEqual(second.assignment, first.assignment);
  assert.equal(second.slots.find((slot) => slot.jankenHand === 'ROCK').cardId, 'club-a');
});

test('missing suit stays visibly representable but disabled and never invents an action', () => {
  const model = buildBattleJankenSlidePadModel({
    roundId: '2',
    hand: [{ id: 'club-only', suit: 'CL', label: 'Club' }],
  });
  const scissors = model.slots.find((slot) => slot.jankenHand === 'SCISSORS');
  const paper = model.slots.find((slot) => slot.jankenHand === 'PAPER');
  assert.equal(scissors.occupied, false);
  assert.equal(scissors.selectable, false);
  assert.equal(paper.occupied, false);
  assert.equal(resolveBattleJankenSlotCardAction(model, 'PAPER', ['club-only']), null);
});

test('slot action fails closed when the referenced card is no longer in the current ordinary hand DOM', () => {
  const model = buildBattleJankenSlidePadModel({ roundId: '3', hand, pickDuplicateIndex: () => 0 });
  assert.equal(resolveBattleJankenSlotCardAction(model, 'ROCK', ['diamond-a', 'spade-a']), null);
});
