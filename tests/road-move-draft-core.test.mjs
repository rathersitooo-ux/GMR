import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ROAD_MOVE_CARD_PRESENTATION_STATE,
  ROAD_MOVE_DRAFT_VALIDITY,
  ROAD_MOVE_FOCUS_STATE,
  cancelRoadMoveDraft,
  createRoadMoveDraft,
  projectRoadMoveDraft,
  setRoadMoveDraftFocus,
  setRoadMoveDraftPath,
} from '../browser/road-move-draft-core.mjs';

const road = (value) => Object.freeze({ id: `road-${value}`, kind: 'road', value });
const battle = Object.freeze({ id: 'battle-x', kind: 'battle', value: 6 });
const cardIdentityOf = (card) => card?.id ?? null;
const boardState = Object.freeze({
  roadValueOf(card) {
    return card?.kind === 'road' ? card.value : null;
  },
  pathStepCountOf(path) {
    return Array.isArray(path) ? path.length : null;
  },
  isPathLegal(path) {
    return Array.isArray(path) && path.every((step) => typeof step === 'string');
  },
  isPathStoppable(path) {
    return Array.isArray(path) && !path.includes('blocked-stop');
  },
});

const stateOf = (view, id) => view.cardStates.find(({ card }) => card.id === id)?.state;

test('card-first keeps one draft: focus Road3, build a 2-step path, then confirm Road3', () => {
  const road3 = road(3);
  const road5 = road(5);
  const hand = [road3, road5, battle];
  const initial = createRoadMoveDraft({ boardVersion: 41 });
  const focused = setRoadMoveDraftFocus(initial, road3);
  const path = ['A-B', 'B-C'];
  const moved = setRoadMoveDraftPath(focused, {
    currentPath: path,
    boardVersion: 41,
    validity: ROAD_MOVE_DRAFT_VALIDITY.VALID,
  });
  const view = projectRoadMoveDraft({ draft: moved, handRoadCards: hand, boardState, cardIdentityOf });

  assert.equal(moved.focusedRoadCard, road3);
  assert.equal(moved.currentPath, path);
  assert.deepEqual(view.compatibleRoadCards.map((card) => card.id), ['road-3', 'road-5']);
  assert.equal(view.focusState, ROAD_MOVE_FOCUS_STATE.FOCUSED);
  assert.equal(stateOf(view, 'road-3'), ROAD_MOVE_CARD_PRESENTATION_STATE.FOCUSED);
  assert.equal(stateOf(view, 'road-5'), ROAD_MOVE_CARD_PRESENTATION_STATE.COMPATIBLE);
  assert.equal(stateOf(view, 'battle-x'), ROAD_MOVE_CARD_PRESENTATION_STATE.NORMAL);
  assert.equal(view.decisionRoadCard, road3);
  assert.equal(view.softFocusRoadCard, null);
  assert.equal(view.confirmReady, true);
});

test('move-first exposes every compatible held Road card and does not choose among multiple candidates', () => {
  const hand = [road(1), road(3), road(5)];
  const draft = setRoadMoveDraftPath(createRoadMoveDraft(), {
    currentPath: ['A-B', 'B-C'],
    validity: ROAD_MOVE_DRAFT_VALIDITY.VALID,
  });
  const view = projectRoadMoveDraft({ draft, handRoadCards: hand, boardState, cardIdentityOf });

  assert.deepEqual(view.compatibleRoadCards.map((card) => card.id), ['road-3', 'road-5']);
  assert.equal(view.focusState, ROAD_MOVE_FOCUS_STATE.NONE);
  assert.equal(view.decisionRoadCard, null);
  assert.equal(view.softFocusRoadCard, null);
  assert.equal(view.confirmReady, false);
  assert.equal(stateOf(view, 'road-1'), ROAD_MOVE_CARD_PRESENTATION_STATE.NORMAL);
  assert.equal(stateOf(view, 'road-3'), ROAD_MOVE_CARD_PRESENTATION_STATE.COMPATIBLE);
  assert.equal(stateOf(view, 'road-5'), ROAD_MOVE_CARD_PRESENTATION_STATE.COMPATIBLE);
});

test('move-first can focus one candidate without changing the current path', () => {
  const road3 = road(3);
  const road5 = road(5);
  const path = ['A-B', 'B-C'];
  const moved = setRoadMoveDraftPath(createRoadMoveDraft(), {
    currentPath: path,
    validity: ROAD_MOVE_DRAFT_VALIDITY.VALID,
  });
  const focused = setRoadMoveDraftFocus(moved, road5);
  const view = projectRoadMoveDraft({
    draft: focused,
    handRoadCards: [road3, road5],
    boardState,
    cardIdentityOf,
  });

  assert.equal(focused.currentPath, path);
  assert.equal(view.decisionRoadCard, road5);
  assert.equal(stateOf(view, 'road-3'), ROAD_MOVE_CARD_PRESENTATION_STATE.COMPATIBLE);
  assert.equal(stateOf(view, 'road-5'), ROAD_MOVE_CARD_PRESENTATION_STATE.FOCUSED);
});

test('Elastic Focus preserves a longer path and marks the old focus invalid instead of auto-switching', () => {
  const road3 = road(3);
  const road5 = road(5);
  const initial = setRoadMoveDraftFocus(createRoadMoveDraft(), road3);
  const path4 = ['A-B', 'B-C', 'C-D', 'D-E'];
  const moved = setRoadMoveDraftPath(initial, {
    currentPath: path4,
    validity: ROAD_MOVE_DRAFT_VALIDITY.VALID,
  });
  const view = projectRoadMoveDraft({
    draft: moved,
    handRoadCards: [road3, road5],
    boardState,
    cardIdentityOf,
  });

  assert.equal(moved.currentPath, path4);
  assert.equal(moved.focusedRoadCard, road3);
  assert.deepEqual(view.compatibleRoadCards.map((card) => card.id), ['road-5']);
  assert.equal(view.focusState, ROAD_MOVE_FOCUS_STATE.INVALID_FOCUS);
  assert.equal(stateOf(view, 'road-3'), ROAD_MOVE_CARD_PRESENTATION_STATE.INVALID_FOCUS);
  assert.equal(stateOf(view, 'road-5'), ROAD_MOVE_CARD_PRESENTATION_STATE.COMPATIBLE);
  assert.equal(view.softFocusRoadCard, road5);
  assert.equal(view.decisionRoadCard, road5);
  assert.equal(view.confirmReady, true);
});

test('one candidate is soft-focused for the decision action but never written into formal focus', () => {
  const road5 = road(5);
  const draft = setRoadMoveDraftPath(createRoadMoveDraft(), {
    currentPath: ['A-B', 'B-C', 'C-D', 'D-E'],
    validity: ROAD_MOVE_DRAFT_VALIDITY.VALID,
  });
  const view = projectRoadMoveDraft({ draft, handRoadCards: [road(1), road5], boardState, cardIdentityOf });

  assert.equal(draft.focusedRoadCard, null);
  assert.equal(view.focusState, ROAD_MOVE_FOCUS_STATE.NONE);
  assert.equal(view.softFocusRoadCard, road5);
  assert.equal(view.decisionRoadCard, road5);
  assert.equal(view.confirmReady, true);
  assert.equal(stateOf(view, 'road-5'), ROAD_MOVE_CARD_PRESENTATION_STATE.COMPATIBLE);
});

test('backtracking recomputes candidates from the current path rather than restoring candidate history', () => {
  const hand = [road(2), road(4), road(5), road(6)];
  let draft = createRoadMoveDraft();

  draft = setRoadMoveDraftPath(draft, {
    currentPath: ['1', '2', '3', '4', '5'],
    validity: ROAD_MOVE_DRAFT_VALIDITY.VALID,
  });
  const at5 = projectRoadMoveDraft({ draft, handRoadCards: hand, boardState, cardIdentityOf });
  assert.deepEqual(at5.compatibleRoadCards.map((card) => card.value), [5, 6]);

  draft = setRoadMoveDraftPath(draft, {
    currentPath: ['1', '2', '3', '4'],
    validity: ROAD_MOVE_DRAFT_VALIDITY.VALID,
  });
  const at4 = projectRoadMoveDraft({ draft, handRoadCards: hand, boardState, cardIdentityOf });
  assert.deepEqual(at4.compatibleRoadCards.map((card) => card.value), [4, 5, 6]);

  draft = setRoadMoveDraftPath(draft, {
    currentPath: ['1', '2'],
    validity: ROAD_MOVE_DRAFT_VALIDITY.VALID,
  });
  const at2 = projectRoadMoveDraft({ draft, handRoadCards: hand, boardState, cardIdentityOf });
  assert.deepEqual(at2.compatibleRoadCards.map((card) => card.value), [2, 4, 5, 6]);
});

test('changing cards never clears the path and cancel resets only tentative movement state', () => {
  const road3 = road(3);
  const road5 = road(5);
  const path = ['A-B', 'B-C'];
  const draft = setRoadMoveDraftPath(createRoadMoveDraft({ boardVersion: 9 }), {
    currentPath: path,
    boardVersion: 9,
    validity: ROAD_MOVE_DRAFT_VALIDITY.VALID,
  });
  const switched = setRoadMoveDraftFocus(setRoadMoveDraftFocus(draft, road3), road5);

  assert.equal(switched.currentPath, path);
  assert.equal(switched.focusedRoadCard, road5);

  const cancelled = cancelRoadMoveDraft(switched, { initialPath: [], boardVersion: 10 });
  assert.deepEqual(cancelled.currentPath, []);
  assert.equal(cancelled.focusedRoadCard, null);
  assert.equal(cancelled.boardVersion, 10);
  assert.equal(cancelled.validity, ROAD_MOVE_DRAFT_VALIDITY.UNASSESSED);
});

test('invalid board path or invalid draft validity prevents confirmation without mutating cards', () => {
  const road5 = road(5);
  const hand = [road5, battle];
  const before = JSON.stringify(hand);
  const blockedPathDraft = setRoadMoveDraftPath(createRoadMoveDraft(), {
    currentPath: ['blocked-stop'],
    validity: ROAD_MOVE_DRAFT_VALIDITY.VALID,
  });
  const blockedPathView = projectRoadMoveDraft({
    draft: blockedPathDraft,
    handRoadCards: hand,
    boardState,
    cardIdentityOf,
  });
  assert.deepEqual(blockedPathView.compatibleRoadCards, []);
  assert.equal(blockedPathView.confirmReady, false);

  const invalidDraft = setRoadMoveDraftPath(createRoadMoveDraft(), {
    currentPath: ['A-B'],
    validity: ROAD_MOVE_DRAFT_VALIDITY.INVALID,
  });
  const invalidView = projectRoadMoveDraft({ draft: invalidDraft, handRoadCards: hand, boardState, cardIdentityOf });
  assert.equal(invalidView.compatibleRoadCards[0], road5);
  assert.equal(invalidView.confirmReady, false);
  assert.equal(JSON.stringify(hand), before);
});

test('snapshot card replacement can preserve focus by caller-owned card identity adapter', () => {
  const originalRoad3 = road(3);
  const refreshedRoad3 = road(3);
  const path = ['A-B'];
  const draft = setRoadMoveDraftPath(setRoadMoveDraftFocus(createRoadMoveDraft(), originalRoad3), {
    currentPath: path,
    validity: ROAD_MOVE_DRAFT_VALIDITY.VALID,
  });
  const view = projectRoadMoveDraft({
    draft,
    handRoadCards: [refreshedRoad3],
    boardState,
    cardIdentityOf,
  });

  assert.equal(view.focusedRoadCardInHand, refreshedRoad3);
  assert.equal(stateOf(view, 'road-3'), ROAD_MOVE_CARD_PRESENTATION_STATE.FOCUSED);
  assert.equal(view.decisionRoadCard, refreshedRoad3);
});
