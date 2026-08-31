import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pathInputHasCompatibleRoadCard,
  projectRoadCardsForPathInput,
} from '../browser/road-move-path-input-projection.mjs';

test('movement-first keeps every compatible road card visible without choosing one', () => {
  const projection = projectRoadCardsForPathInput({
    compatibleRoadCardIds: ['road-3', 'road-5'],
  });

  assert.deepEqual(projection.compatibleRoadCardIds, ['road-3', 'road-5']);
  assert.equal(projection.candidateCount, 2);
  assert.equal(projection.hasCompatibleRoadCard, true);
  assert.equal(projection.focusedRoadCardId, null);
  assert.equal(projection.softFocusRoadCardId, null);
  assert.equal(projection.requiresExplicitChoice, true);
  assert.equal(projection.autoSelectedRoadCardId, null);
});

test('a sole compatible candidate is soft focus only, never explicit or automatic selection', () => {
  const projection = projectRoadCardsForPathInput({
    compatibleRoadCardIds: ['road-5'],
  });

  assert.equal(projection.softFocusRoadCardId, 'road-5');
  assert.equal(projection.focusedRoadCardId, null);
  assert.equal(projection.requiresExplicitChoice, false);
  assert.equal(projection.autoSelectedRoadCardId, null);
});

test('path extension can be gated by candidate existence without reimplementing board legality', () => {
  assert.equal(pathInputHasCompatibleRoadCard({ compatibleRoadCardIds: ['road-6'] }), true);
  assert.equal(pathInputHasCompatibleRoadCard({ compatibleRoadCardIds: [] }), false);
});

test('explicit focus chosen after movement is preserved when still compatible', () => {
  const projection = projectRoadCardsForPathInput({
    compatibleRoadCardIds: ['road-3', 'road-5', 'road-6'],
    focusedRoadCardId: 'road-5',
  });

  assert.equal(projection.focusedRoadCardId, 'road-5');
  assert.equal(projection.focusedRoadCardStillCompatible, true);
  assert.equal(projection.softFocusRoadCardId, null);
  assert.equal(projection.requiresExplicitChoice, false);
  assert.equal(projection.autoSelectedRoadCardId, null);
});

test('path change never swaps an invalid explicit focus to another compatible card', () => {
  const projection = projectRoadCardsForPathInput({
    compatibleRoadCardIds: ['road-5', 'road-6'],
    focusedRoadCardId: 'road-3',
  });

  assert.equal(projection.focusedRoadCardId, 'road-3');
  assert.equal(projection.focusedRoadCardStillCompatible, false);
  assert.equal(projection.softFocusRoadCardId, null);
  assert.equal(projection.requiresExplicitChoice, true);
  assert.equal(projection.autoSelectedRoadCardId, null);
  assert.deepEqual(projection.compatibleRoadCardIds, ['road-5', 'road-6']);
});

test('projection is deliberately card-rule blind and rejects malformed compatible-id input', () => {
  assert.throws(
    () => projectRoadCardsForPathInput({ compatibleRoadCardIds: ['road-3', 'road-3'] }),
    /DUPLICATE_COMPATIBLE_ROAD_CARD_ID/,
  );
  assert.throws(
    () => projectRoadCardsForPathInput({ compatibleRoadCardIds: [''] }),
    /COMPATIBLE_ROAD_CARD_ID_INVALID/,
  );
});
