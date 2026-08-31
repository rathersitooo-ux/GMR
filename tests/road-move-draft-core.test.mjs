import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRoadMoveDraft,
  updateRoadMoveDraft,
  ROAD_MOVE_FOCUS_STATE,
} from '../browser/road-move-draft-core.mjs';

const road = value => ({ id: `road-${value}`, kind: 'road', value });
const battle = () => ({ id: 'battle-6', kind: 'battle', value: 6 });
const path = steps => Array.from({ length: steps + 1 }, (_, index) => `p${index}`);
const boardState = {
  roadValueOf(card) { return card?.kind === 'road' ? card.value : null; },
  pathStepCountOf(currentPath) { return Array.isArray(currentPath) ? Math.max(0, currentPath.length - 1) : null; },
  isPathLegal(currentPath) { return Array.isArray(currentPath) && currentPath.every((v, i) => i === 0 || v !== currentPath[i - 1]); },
  isPathStoppable(currentPath) { return this.isPathLegal(currentPath); },
  sameRoadCard(a, b) { return a?.id === b?.id; },
};
function deriveCompatibleRoadCards(hand, currentPath, state) {
  const steps = state.pathStepCountOf(currentPath);
  if (steps < 1 || !state.isPathLegal(currentPath) || !state.isPathStoppable(currentPath)) return [];
  return hand.filter(card => card.kind === 'road' && card.value >= steps && card.value >= 1 && card.value <= 6);
}
const context = handRoadCards => ({ handRoadCards, boardState, deriveCompatibleRoadCards });

for (let value = 1; value <= 6; value += 1) {
  test(`shared compatibility contract keeps Road${value} as an upper bound`, () => {
    const hand = [road(value)];
    for (let steps = 1; steps <= value; steps += 1) {
      const draft = createRoadMoveDraft({ currentPath: path(steps) }, context(hand));
      assert.equal(draft.compatibleRoadCards.length, 1);
    }
    assert.equal(createRoadMoveDraft({ currentPath: path(value + 1) }, context(hand)).compatibleRoadCards.length, 0);
  });
}

test('movement-first keeps every candidate and never auto-focuses', () => {
  const hand = [road(1), road(3), road(5), battle()];
  const draft = createRoadMoveDraft({ currentPath: path(2) }, context(hand));
  assert.deepEqual(draft.compatibleRoadCards.map(card => card.id), ['road-3', 'road-5']);
  assert.equal(draft.focusState, ROAD_MOVE_FOCUS_STATE.NONE);
  assert.equal(draft.focusedRoadCard, null);
  assert.equal(draft.decisionRoadCard, null);
  assert.equal(draft.requiresRoadCardChoice, true);
  assert.equal(draft.canDecide, false);
});

test('card-first focus is preserved and can decide a shorter legal path', () => {
  const hand = [road(3), road(5)];
  const draft = createRoadMoveDraft({ focusedRoadCard: hand[0], currentPath: path(2) }, context(hand));
  assert.equal(draft.focusState, ROAD_MOVE_FOCUS_STATE.FOCUSED);
  assert.equal(draft.decisionRoadCard, hand[0]);
  assert.equal(draft.canDecide, true);
});

test('Elastic Focus preserves path, exposes stronger extension, and never switches focus', () => {
  const hand = [road(3), road(5)];
  const elasticContext = {
    handRoadCards: hand,
    boardState,
    deriveCompatibleRoadCards,
    reachableForCard(card) { return Array.from({ length: card.value }, (_, index) => index + 1); },
  };
  const focused = createRoadMoveDraft({ focusedRoadCard: hand[0], currentPath: path(2) }, elasticContext);
  assert.deepEqual(focused.strongReachablePositions, [1, 2, 3]);
  assert.deepEqual(focused.expandableReachablePositions, [4, 5]);

  const extended = updateRoadMoveDraft(focused, { currentPath: path(4) }, elasticContext);
  assert.deepEqual(extended.currentPath, path(4));
  assert.equal(extended.focusedRoadCard, hand[0]);
  assert.equal(extended.focusState, ROAD_MOVE_FOCUS_STATE.INVALID_FOCUS);
  assert.deepEqual(extended.compatibleRoadCards.map(card => card.id), ['road-5']);
  assert.deepEqual(extended.switchRoadCards.map(card => card.id), ['road-5']);
  assert.equal(extended.softFocusRoadCard, null);
  assert.equal(extended.decisionRoadCard, hand[1]);
});

test('backtracking recomputes candidates only from current hand/path/board', () => {
  const hand = [road(2), road(4), road(5), road(6)];
  let draft = createRoadMoveDraft({ currentPath: path(5) }, context(hand));
  assert.deepEqual(draft.compatibleRoadCards.map(card => card.value), [5, 6]);
  draft = updateRoadMoveDraft(draft, { currentPath: path(4) }, context(hand));
  assert.deepEqual(draft.compatibleRoadCards.map(card => card.value), [4, 5, 6]);
  draft = updateRoadMoveDraft(draft, { currentPath: path(2) }, context(hand));
  assert.deepEqual(draft.compatibleRoadCards.map(card => card.value), [2, 4, 5, 6]);
});

test('sole compatible card is only soft focus; formal focus remains null', () => {
  const hand = [road(1), road(5)];
  const draft = createRoadMoveDraft({ currentPath: path(4) }, context(hand));
  assert.equal(draft.focusedRoadCard, null);
  assert.equal(draft.softFocusRoadCard, hand[1]);
  assert.equal(draft.decisionRoadCard, hand[1]);
  assert.equal(draft.canDecide, true);
});

test('changing and clearing Road focus preserve currentPath', () => {
  const hand = [road(3), road(5)];
  const initial = createRoadMoveDraft({ currentPath: path(2), focusedRoadCard: hand[0] }, context(hand));
  const changed = updateRoadMoveDraft(initial, { focusedRoadCard: hand[1] }, context(hand));
  assert.deepEqual(changed.currentPath, initial.currentPath);
  const cleared = updateRoadMoveDraft(changed, { focusedRoadCard: null }, context(hand));
  assert.deepEqual(cleared.currentPath, initial.currentPath);
  assert.equal(cleared.focusedRoadCard, null);
});

test('card-first before movement stays focused but cannot decide', () => {
  const hand = [road(3), road(5)];
  const draft = createRoadMoveDraft({ currentPath: ['p0'], focusedRoadCard: hand[0] }, context(hand));
  assert.equal(draft.focusState, ROAD_MOVE_FOCUS_STATE.FOCUSED);
  assert.equal(draft.canDecide, false);
  assert.deepEqual(draft.compatibleRoadCards, []);
});

test('derived fields are read-only and Battle cards are not selected or mutated', () => {
  const b = battle();
  const hand = [road(3), b];
  const draft = createRoadMoveDraft({ currentPath: path(2) }, context(hand));
  assert.deepEqual(draft.compatibleRoadCards.map(card => card.id), ['road-3']);
  assert.throws(() => updateRoadMoveDraft(draft, { compatibleRoadCards: [b] }, context(hand)), /DERIVED_FIELD_WRITE_FORBIDDEN/);
  assert.deepEqual(b, { id: 'battle-6', kind: 'battle', value: 6 });
});
