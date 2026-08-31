import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NEW_BASE_BATTLE_PLAN_PRESENTATION_SCHEMA,
  projectNewBaseBattlePlanPresentation,
} from '../browser/new-base-battle-plan-presentation-core.mjs';

const fixedSlots = [
  { slotId: 'rock-slot', jankenHand: 'ROCK' },
  { slotId: 'scissors-slot', jankenHand: 'SCISSORS' },
  { slotId: 'paper-slot', jankenHand: 'PAPER' },
];
const assignments = [
  { slotId: 'rock-slot', jankenHand: 'ROCK', cardId: 'c1' },
  { slotId: 'scissors-slot', jankenHand: 'SCISSORS', cardId: 'c2' },
  { slotId: 'paper-slot', jankenHand: 'PAPER', cardId: 'c3' },
];
const cards = [
  { cardId: 'c1', intrinsicSuit: 'FOREST', label: 'A' },
  { cardId: 'c2', intrinsicSuit: 'SWORD', label: 'B' },
  { cardId: 'c3', intrinsicSuit: 'DINO', label: 'C' },
];

function enabledInput(extra = {}) {
  return {
    enabled: true,
    fixedSlots,
    assignments,
    cards,
    selectedSlotId: 'scissors-slot',
    selectedCardId: 'c2',
    dice: { rollValue: 4, movementDelta: 4 },
    movementBudget: { base: 3, dice: 4, total: 7 },
    mana: { current: 2, max: 5, recoveryStatus: 'UNDECIDED', recoveryAmount: null },
    board: {
      schemaVersion: 'gameroad.new-base-board-graph.v1',
      validPositionIds: ['goal-a', 'shield-a', 'road-a-1', 'field-a'],
      zonePositionIds: {
        goal: ['goal-a'],
        shield: ['shield-a'],
        roadSlot: ['road-a-1'],
        field: ['field-a'],
      },
    },
    camera: { mode: 'PLAN', focusPositionId: 'road-a-1', transform: { scale: 1 } },
    ...extra,
  };
}

test('inactive projection is presentation-only and does not require gameplay producers', () => {
  const view = projectNewBaseBattlePlanPresentation({ enabled: false });
  assert.equal(view.schemaVersion, NEW_BASE_BATTLE_PLAN_PRESENTATION_SCHEMA);
  assert.equal(view.active, false);
  assert.equal(view.authority.gameStateWrite, false);
  assert.equal(view.authority.cameraMutatesLogicalState, false);
  assert.ok(Object.isFrozen(view));
});

test('projects authoritative slots without overwriting intrinsic card suit', () => {
  const view = projectNewBaseBattlePlanPresentation(enabledInput());
  assert.equal(view.slots.length, 3);
  assert.deepEqual(view.slots.map(({ jankenHand }) => jankenHand), ['ROCK', 'SCISSORS', 'PAPER']);
  assert.equal(view.slots[1].card.cardId, 'c2');
  assert.equal(view.slots[1].card.intrinsicSuit, 'SWORD');
  assert.equal(view.slots[1].selected, true);
  assert.equal(view.slots[0].selected, false);
});

test('copies dice and movement totals without deriving or changing them', () => {
  const view = projectNewBaseBattlePlanPresentation(enabledInput({
    dice: { rollValue: 6, movementDelta: 6, receiptId: 'dice-1' },
    movementBudget: { base: 1, dice: 6, total: 99, receiptId: 'move-1' },
  }));
  assert.equal(view.dice.rollValue, 6);
  assert.equal(view.dice.movementDelta, 6);
  assert.equal(view.movementBudget.total, 99);
});

test('keeps undecided mana recovery explicitly null', () => {
  const view = projectNewBaseBattlePlanPresentation(enabledInput());
  assert.equal(view.mana.recoveryStatus, 'UNDECIDED');
  assert.equal(view.mana.recoveryAmount, null);
  assert.throws(() => projectNewBaseBattlePlanPresentation(enabledInput({
    mana: { current: 2, max: 5, recoveryStatus: 'UNDECIDED', recoveryAmount: 1 },
  })), /UNDECIDED mana recovery/);
});

test('fails closed when selected card and fixed slot assignment disagree', () => {
  assert.throws(() => projectNewBaseBattlePlanPresentation(enabledInput({
    selectedSlotId: 'rock-slot',
    selectedCardId: 'c2',
  })), /selected card must match/);
});

test('fails closed on janken assignment mismatch instead of resolving it in presentation', () => {
  const badAssignments = assignments.map((entry) => ({ ...entry }));
  badAssignments[0].jankenHand = 'PAPER';
  assert.throws(() => projectNewBaseBattlePlanPresentation(enabledInput({ assignments: badAssignments })), /must match fixed slot/);
});

test('board zones are copied as caller-authoritative identities with no inferred adjacency or win state', () => {
  const view = projectNewBaseBattlePlanPresentation(enabledInput());
  assert.deepEqual(view.board.zones.roadSlot, ['road-a-1']);
  assert.equal('adjacency' in view.board, false);
  assert.equal('winner' in view.board, false);
});

test('Pursuit-only payloads are ignored by the new-base presentation projection', () => {
  const view = projectNewBaseBattlePlanPresentation(enabledInput({
    pursuit: { battleAddend: 999, subdeck: ['x'], physicalManaLoss: 5, finisherMultiplier: 8 },
  }));
  assert.equal('pursuit' in view, false);
  assert.equal(JSON.stringify(view).includes('battleAddend'), false);
});
