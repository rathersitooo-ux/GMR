import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const corePath = process.env.CORE_UNDER_TEST || path.resolve(import.meta.dirname, '../browser/road-card-focus-projection-core.mjs');
const { projectRoadCardFocus, ROAD_CARD_FOCUS_STATES } = await import(pathToFileURL(corePath).href + `?v=${Date.now()}`);

const r1 = { id: 'road-1', value: 1 };
const r3 = { id: 'road-3', value: 3 };
const r5 = { id: 'road-5', value: 5 };

function board(steps) {
  return {
    pathStepCountOf: () => steps,
    sameRoadCard: (a, b) => a.id === b.id,
  };
}

function compatible(card, _path, state) {
  return state.pathStepCountOf() > 0 && state.pathStepCountOf() <= card.value;
}

function stateOf(out, id) {
  return out.cardPresentations.find(entry => entry.card.id === id)?.state;
}

test('card-first focus is valid before movement without inventing a separate mode', () => {
  const pathDraft = [];
  let compatibilityCalls = 0;
  const out = projectRoadCardFocus({
    handRoadCards: [r1, r3, r5],
    currentPath: pathDraft,
    focusedRoadCard: r3,
    boardState: board(0),
    isCompatible: (...args) => {
      compatibilityCalls += 1;
      return compatible(...args);
    },
    reachableForCard: card => card === r3 ? ['P1', 'P2', 'P3'] : [],
  });

  assert.equal(out.ok, true);
  assert.equal(out.focusState, ROAD_CARD_FOCUS_STATES.FOCUSED);
  assert.equal(stateOf(out, 'road-3'), ROAD_CARD_FOCUS_STATES.FOCUSED);
  assert.equal(stateOf(out, 'road-1'), ROAD_CARD_FOCUS_STATES.NORMAL);
  assert.equal(stateOf(out, 'road-5'), ROAD_CARD_FOCUS_STATES.NORMAL);
  assert.deepEqual(out.focusedReachablePositionIds, ['P1', 'P2', 'P3']);
  assert.equal(compatibilityCalls, 0);
  assert.equal(out.currentPath, pathDraft);
  assert.equal(out.pathMutation, 'none');
  assert.equal(out.interactionMode, null);
  assert.equal(out.autoSelectedRoadCard, null);
});

test('focused Road3 stays focused on a compatible two-step path while other compatible cards remain candidates', () => {
  const pathDraft = ['A', 'B'];
  const out = projectRoadCardFocus({
    handRoadCards: [r1, r3, r5],
    currentPath: pathDraft,
    focusedRoadCard: r3,
    boardState: board(2),
    isCompatible: compatible,
    reachableForCard: () => ['P1', 'P2', 'P3'],
  });

  assert.equal(out.focusState, ROAD_CARD_FOCUS_STATES.FOCUSED);
  assert.equal(stateOf(out, 'road-1'), ROAD_CARD_FOCUS_STATES.NORMAL);
  assert.equal(stateOf(out, 'road-3'), ROAD_CARD_FOCUS_STATES.FOCUSED);
  assert.equal(stateOf(out, 'road-5'), ROAD_CARD_FOCUS_STATES.COMPATIBLE);
  assert.equal(out.currentPath, pathDraft);
  assert.equal(out.autoSelectedRoadCard, null);
});

test('invalid focus preserves the longer path and exposes another compatible card without auto-switching', () => {
  const pathDraft = ['A', 'B', 'C', 'D'];
  const out = projectRoadCardFocus({
    handRoadCards: [r1, r3, r5],
    currentPath: pathDraft,
    focusedRoadCard: r3,
    boardState: board(4),
    isCompatible: compatible,
    reachableForCard: () => ['P1', 'P2', 'P3'],
  });

  assert.equal(out.focusState, ROAD_CARD_FOCUS_STATES.INVALID_FOCUS);
  assert.equal(stateOf(out, 'road-3'), ROAD_CARD_FOCUS_STATES.INVALID_FOCUS);
  assert.equal(stateOf(out, 'road-5'), ROAD_CARD_FOCUS_STATES.COMPATIBLE);
  assert.equal(out.currentPath, pathDraft);
  assert.equal(out.pathMutation, 'none');
  assert.equal(out.autoSelectedRoadCard, null);
});

test('focus becomes invalid if the focused Road card is no longer in the current hand', () => {
  const missingR3 = { id: 'road-3', value: 3 };
  const out = projectRoadCardFocus({
    handRoadCards: [r1, r5],
    currentPath: ['A', 'B'],
    focusedRoadCard: missingR3,
    boardState: board(2),
    isCompatible: compatible,
    reachableForCard: () => ['SHOULD_NOT_APPEAR'],
  });

  assert.equal(out.focusState, ROAD_CARD_FOCUS_STATES.INVALID_FOCUS);
  assert.equal(stateOf(out, 'road-5'), ROAD_CARD_FOCUS_STATES.COMPATIBLE);
  assert.deepEqual(out.focusedReachablePositionIds, []);
  assert.equal(out.autoSelectedRoadCard, null);
});

test('unfocused projection keeps the path and only marks current compatible cards', () => {
  const pathDraft = ['A', 'B'];
  const out = projectRoadCardFocus({
    handRoadCards: [r1, r3, r5],
    currentPath: pathDraft,
    focusedRoadCard: null,
    boardState: board(2),
    isCompatible: compatible,
    reachableForCard: () => ['UNUSED'],
  });

  assert.equal(out.focusState, null);
  assert.equal(stateOf(out, 'road-1'), ROAD_CARD_FOCUS_STATES.NORMAL);
  assert.equal(stateOf(out, 'road-3'), ROAD_CARD_FOCUS_STATES.COMPATIBLE);
  assert.equal(stateOf(out, 'road-5'), ROAD_CARD_FOCUS_STATES.COMPATIBLE);
  assert.deepEqual(out.focusedReachablePositionIds, []);
  assert.equal(out.currentPath, pathDraft);
});

test('fails closed when the caller does not provide an authoritative path step count', () => {
  const out = projectRoadCardFocus({
    handRoadCards: [r3],
    currentPath: [],
    focusedRoadCard: r3,
    boardState: {},
    isCompatible: compatible,
    reachableForCard: () => ['P1'],
  });

  assert.equal(out.ok, false);
  assert.equal(out.reason, 'PATH_STEP_COUNT_UNAVAILABLE');
  assert.equal(out.pathMutation, 'none');
  assert.equal(out.autoSelectedRoadCard, null);
});
