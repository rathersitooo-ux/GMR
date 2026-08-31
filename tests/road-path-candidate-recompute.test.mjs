import test from 'node:test';
import assert from 'node:assert/strict';

import {
  projectRoadPathCandidates,
  reconcileRoadPathChange,
} from '../browser/road-path-candidate-recompute.mjs';

const road = (value) => Object.freeze({ id: `R${value}`, value });
const route = (steps) => Array.from({ length: steps + 1 }, (_, i) => `N${i}`);
const ids = (cards) => cards.map((card) => card.id);

function deriveByMaximum({ handRoadCards, currentPath }) {
  const steps = currentPath.length - 1;
  return handRoadCards.filter((card) => card.value >= steps);
}

test('recomputes candidates from the current path when the path shrinks or grows', () => {
  const hand = [road(2), road(4), road(5), road(6)];
  const draft = {
    currentPath: route(0),
    focusedRoadCard: null,
    compatibleRoadCards: [],
    boardVersion: 17,
  };

  const atFive = reconcileRoadPathChange({
    draftMove: draft,
    nextPath: route(5),
    handRoadCards: hand,
    deriveCompatibleRoadCards: deriveByMaximum,
  });
  assert.deepEqual(ids(atFive.compatibleRoadCards), ['R5', 'R6']);

  const atFour = reconcileRoadPathChange({
    draftMove: atFive,
    nextPath: route(4),
    handRoadCards: hand,
    deriveCompatibleRoadCards: deriveByMaximum,
  });
  assert.deepEqual(ids(atFour.compatibleRoadCards), ['R4', 'R5', 'R6']);

  const atTwo = reconcileRoadPathChange({
    draftMove: atFour,
    nextPath: route(2),
    handRoadCards: hand,
    deriveCompatibleRoadCards: deriveByMaximum,
  });
  assert.deepEqual(ids(atTwo.compatibleRoadCards), ['R2', 'R4', 'R5', 'R6']);

  const backToFive = reconcileRoadPathChange({
    draftMove: atTwo,
    nextPath: route(5),
    handRoadCards: hand,
    deriveCompatibleRoadCards: deriveByMaximum,
  });
  assert.deepEqual(ids(backToFive.compatibleRoadCards), ['R5', 'R6']);
});

test('candidate history is never restored; current hand and current path are re-read every call', () => {
  let derivations = 0;
  const derive = (input) => {
    derivations += 1;
    return deriveByMaximum(input);
  };

  const withFour = projectRoadPathCandidates({
    currentPath: route(4),
    handRoadCards: [road(4), road(6)],
    deriveCompatibleRoadCards: derive,
  });
  assert.deepEqual(ids(withFour.compatibleRoadCards), ['R4', 'R6']);

  const withoutFour = projectRoadPathCandidates({
    currentPath: route(4),
    handRoadCards: [road(6)],
    deriveCompatibleRoadCards: derive,
  });
  assert.deepEqual(ids(withoutFour.compatibleRoadCards), ['R6']);
  assert.equal(derivations, 2);
});

test('an insufficient focused Road card does not delete the path or auto-switch the focus', () => {
  const focused = road(3);
  const draft = {
    currentPath: route(3),
    focusedRoadCard: focused,
    compatibleRoadCards: [focused],
    selectedRoadCard: null,
    boardVersion: 8,
  };

  const next = reconcileRoadPathChange({
    draftMove: draft,
    nextPath: route(4),
    handRoadCards: [focused, road(5)],
    deriveCompatibleRoadCards: deriveByMaximum,
  });

  assert.deepEqual(next.currentPath, route(4));
  assert.deepEqual(ids(next.compatibleRoadCards), ['R5']);
  assert.equal(next.focusedRoadCard, focused);
  assert.equal(next.selectedRoadCard, null);
});

test('multiple compatible cards remain multiple and no formal Road selection is invented', () => {
  const draft = {
    currentPath: route(0),
    focusedRoadCard: null,
    compatibleRoadCards: [],
    roadId: null,
  };

  const next = reconcileRoadPathChange({
    draftMove: draft,
    nextPath: route(2),
    handRoadCards: [road(3), road(5), road(6)],
    deriveCompatibleRoadCards: deriveByMaximum,
  });

  assert.deepEqual(ids(next.compatibleRoadCards), ['R3', 'R5', 'R6']);
  assert.equal(next.roadId, null);
  assert.equal(next.focusedRoadCard, null);
});

test('unrelated Battle data is preserved verbatim', () => {
  const battleReservation = Object.freeze({ id: 'BATTLE-X', slot: 2 });
  const draft = {
    currentPath: route(1),
    focusedRoadCard: null,
    compatibleRoadCards: [],
    battleId: 'BATTLE-X',
    battleReservation,
  };

  const next = reconcileRoadPathChange({
    draftMove: draft,
    nextPath: route(2),
    handRoadCards: [road(3)],
    deriveCompatibleRoadCards: deriveByMaximum,
  });

  assert.equal(next.battleId, 'BATTLE-X');
  assert.equal(next.battleReservation, battleReservation);
  assert.deepEqual(ids(next.compatibleRoadCards), ['R3']);
});

test('rejects malformed path or compatibility outputs instead of fabricating candidates', () => {
  assert.throws(() => projectRoadPathCandidates({
    currentPath: [],
    handRoadCards: [],
    deriveCompatibleRoadCards: () => [],
  }), /start position/);

  assert.throws(() => projectRoadPathCandidates({
    currentPath: route(1),
    handRoadCards: [],
    deriveCompatibleRoadCards: () => null,
  }), /result must be an array/);
});
