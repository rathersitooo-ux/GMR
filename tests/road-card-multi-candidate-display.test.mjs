import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ROAD_CARD_FOCUS_STATES,
  projectRoadCardFocus,
} from '../browser/road-card-focus-projection-core.mjs';

function road(value) {
  return Object.freeze({ id: `road-${value}`, kind: 'road', value });
}

const boardState = Object.freeze({
  pathStepCountOf(path) {
    return Array.isArray(path) ? Math.max(0, path.length - 1) : 0;
  },
  sameRoadCard(a, b) {
    return a?.id === b?.id;
  },
});

function isCompatible(card, currentPath) {
  const steps = boardState.pathStepCountOf(currentPath);
  return card?.kind === 'road' && Number.isInteger(card.value) && card.value >= steps;
}

function statesById(result) {
  return Object.fromEntries(result.cardPresentations.map(({ card, state }) => [card.id, state]));
}

test('2-step path keeps Road3, Road5, and Road6 simultaneously COMPATIBLE', () => {
  const handRoadCards = [road(1), road(3), road(5), road(6)];
  const currentPath = ['P0', 'P1', 'P2'];

  const result = projectRoadCardFocus({
    handRoadCards,
    currentPath,
    focusedRoadCard: null,
    boardState,
    isCompatible,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(statesById(result), {
    'road-1': ROAD_CARD_FOCUS_STATES.NORMAL,
    'road-3': ROAD_CARD_FOCUS_STATES.COMPATIBLE,
    'road-5': ROAD_CARD_FOCUS_STATES.COMPATIBLE,
    'road-6': ROAD_CARD_FOCUS_STATES.COMPATIBLE,
  });
  assert.equal(
    result.cardPresentations.filter(({ state }) => state === ROAD_CARD_FOCUS_STATES.COMPATIBLE).length,
    3,
  );
  assert.equal(result.autoSelectedRoadCard, null);
  assert.equal(result.pathMutation, 'none');
  assert.equal(result.interactionMode, null);
});

test('focused Road3 does not hide or auto-select the other compatible candidates', () => {
  const handRoadCards = [road(1), road(3), road(5), road(6)];
  const currentPath = ['P0', 'P1', 'P2'];
  const focusedRoadCard = handRoadCards[1];

  const result = projectRoadCardFocus({
    handRoadCards,
    currentPath,
    focusedRoadCard,
    boardState,
    isCompatible,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(statesById(result), {
    'road-1': ROAD_CARD_FOCUS_STATES.NORMAL,
    'road-3': ROAD_CARD_FOCUS_STATES.FOCUSED,
    'road-5': ROAD_CARD_FOCUS_STATES.COMPATIBLE,
    'road-6': ROAD_CARD_FOCUS_STATES.COMPATIBLE,
  });
  assert.equal(result.focusedRoadCard, focusedRoadCard);
  assert.equal(result.autoSelectedRoadCard, null);
  assert.equal(result.pathMutation, 'none');
  assert.equal(result.interactionMode, null);
});

test('presentation projection exposes no Battle-card or candidate-modal side channel', () => {
  const handRoadCards = [road(3), road(5)];
  const result = projectRoadCardFocus({
    handRoadCards,
    currentPath: ['P0', 'P1', 'P2'],
    boardState,
    isCompatible,
  });

  assert.equal(result.ok, true);
  assert.equal('battleCard' in result, false);
  assert.equal('battleCards' in result, false);
  assert.equal('candidateModal' in result, false);
  assert.equal('candidateDialog' in result, false);
  assert.deepEqual(result.cardPresentations.map(({ card }) => card), handRoadCards);
});
