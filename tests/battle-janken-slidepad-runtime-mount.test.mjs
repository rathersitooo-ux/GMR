import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_JANKEN_SLIDEPAD_RUNTIME_SCHEMA,
  buildBattleJankenSlidePadModel,
  resolveBattleJankenSlotCardAction,
  resolveBattleJankenSlidePadGestureTarget,
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

test('gesture direction sticks to the eligible slot that lies along the drag direction', () => {
  const target = resolveBattleJankenSlidePadGestureTarget({
    origin: { x: 100, y: 100 },
    pointer: { x: 35, y: 92 },
    candidates: [
      { id: 'ROCK', x: 0, y: 105, selectable: true },
      { id: 'SCISSORS', x: 30, y: 25, selectable: true },
      { id: 'PAPER', x: 92, y: 0, selectable: true },
    ],
  });
  assert.equal(target, 'ROCK');
});

test('gesture stays neutral inside the handle dead zone', () => {
  const target = resolveBattleJankenSlidePadGestureTarget({
    origin: { x: 100, y: 100 },
    pointer: { x: 94, y: 97 },
    candidates: [{ id: 'ROCK', x: 0, y: 100, selectable: true }],
  });
  assert.equal(target, null);
});

test('gesture never snaps to an empty or disabled slot', () => {
  const target = resolveBattleJankenSlidePadGestureTarget({
    origin: { x: 100, y: 100 },
    pointer: { x: 30, y: 100 },
    candidates: [
      { id: 'ROCK', x: 0, y: 100, selectable: false },
      { id: 'SCISSORS', x: 100, y: 0, selectable: true },
    ],
  });
  assert.equal(target, null);
});
