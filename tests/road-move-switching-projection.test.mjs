import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RoadMoveFocusStatus,
  projectRoadMoveSwitching,
  transitionRoadMoveSwitching,
} from '../browser/road-move-switching-projection.mjs';

test('card -> move -> card change preserves the path and never auto-switches', () => {
  const twoStepPath = Object.freeze(['start', 'n1', 'n2']);
  let view = projectRoadMoveSwitching({
    currentPath: twoStepPath,
    focusedRoadCardId: 'road-3',
    compatibleRoadCardIds: ['road-3', 'road-5', 'road-6'],
  });
  assert.equal(view.focusStatus, RoadMoveFocusStatus.FOCUSED);

  const fourStepPath = Object.freeze(['start', 'n1', 'n2', 'n3', 'n4']);
  view = transitionRoadMoveSwitching(view, {
    type: 'PATH_RECONCILED',
    currentPath: fourStepPath,
    compatibleRoadCardIds: ['road-5', 'road-6'],
  });

  assert.strictEqual(view.currentPath, fourStepPath);
  assert.equal(view.focusedRoadCardId, 'road-3');
  assert.equal(view.focusStatus, RoadMoveFocusStatus.INVALID_FOCUS);
  assert.deepEqual(view.switchableRoadCardIds, ['road-5', 'road-6']);

  const switched = transitionRoadMoveSwitching(view, {
    type: 'FOCUS_ROAD_CARD',
    cardId: 'road-5',
  });
  assert.strictEqual(switched.currentPath, fourStepPath);
  assert.equal(switched.focusedRoadCardId, 'road-5');
  assert.equal(switched.focusStatus, RoadMoveFocusStatus.FOCUSED);
});

test('move -> card -> path change keeps explicit focus while it stays compatible', () => {
  const path = Object.freeze(['start', 'n1', 'n2']);
  let view = projectRoadMoveSwitching({
    currentPath: path,
    compatibleRoadCardIds: ['road-3', 'road-5'],
  });
  assert.equal(view.focusedRoadCardId, null);
  assert.equal(view.focusStatus, RoadMoveFocusStatus.NONE);

  view = transitionRoadMoveSwitching(view, {
    type: 'FOCUS_ROAD_CARD',
    cardId: 'road-5',
  });
  assert.strictEqual(view.currentPath, path);
  assert.equal(view.focusedRoadCardId, 'road-5');

  const shorterPath = Object.freeze(['start', 'n1']);
  view = transitionRoadMoveSwitching(view, {
    type: 'PATH_RECONCILED',
    currentPath: shorterPath,
    compatibleRoadCardIds: ['road-1', 'road-3', 'road-5'],
  });
  assert.strictEqual(view.currentPath, shorterPath);
  assert.equal(view.focusedRoadCardId, 'road-5');
  assert.equal(view.focusStatus, RoadMoveFocusStatus.FOCUSED);
  assert.deepEqual(view.switchableRoadCardIds, ['road-1', 'road-3']);
});

test('clearing focus preserves path and leaves all compatible cards available', () => {
  const path = Object.freeze(['start', 'n1', 'n2']);
  const focused = projectRoadMoveSwitching({
    currentPath: path,
    focusedRoadCardId: 'road-3',
    compatibleRoadCardIds: ['road-3', 'road-5'],
  });

  const cleared = transitionRoadMoveSwitching(focused, { type: 'CLEAR_ROAD_FOCUS' });
  assert.strictEqual(cleared.currentPath, path);
  assert.equal(cleared.focusedRoadCardId, null);
  assert.equal(cleared.focusStatus, RoadMoveFocusStatus.NONE);
  assert.deepEqual(cleared.switchableRoadCardIds, ['road-3', 'road-5']);
});

test('an incompatible focus request is rejected without changing path or focus', () => {
  const path = Object.freeze(['start', 'n1', 'n2']);
  const view = projectRoadMoveSwitching({
    currentPath: path,
    focusedRoadCardId: 'road-3',
    compatibleRoadCardIds: ['road-3', 'road-5'],
  });

  const rejected = transitionRoadMoveSwitching(view, {
    type: 'FOCUS_ROAD_CARD',
    cardId: 'road-1',
  });
  assert.strictEqual(rejected, view);
  assert.strictEqual(rejected.currentPath, path);
  assert.equal(rejected.focusedRoadCardId, 'road-3');
});

test('one remaining candidate is not promoted to formal focus', () => {
  const view = projectRoadMoveSwitching({
    currentPath: ['start', 'n1', 'n2', 'n3', 'n4', 'n5'],
    compatibleRoadCardIds: ['road-5'],
  });
  assert.equal(view.focusedRoadCardId, null);
  assert.equal(view.focusStatus, RoadMoveFocusStatus.NONE);
  assert.deepEqual(view.switchableRoadCardIds, ['road-5']);
});

test('Road1-6 identities use the same focus transition', () => {
  const path = Object.freeze(['start', 'n1']);
  const compatibleRoadCardIds = Array.from({ length: 6 }, (_, index) => `road-${index + 1}`);
  const base = projectRoadMoveSwitching({ currentPath: path, compatibleRoadCardIds });

  for (const cardId of compatibleRoadCardIds) {
    const focused = transitionRoadMoveSwitching(base, {
      type: 'FOCUS_ROAD_CARD',
      cardId,
    });
    assert.strictEqual(focused.currentPath, path);
    assert.equal(focused.focusedRoadCardId, cardId);
    assert.equal(focused.focusStatus, RoadMoveFocusStatus.FOCUSED);
  }
});

test('duplicate compatible identities fail closed instead of creating ambiguous switching', () => {
  assert.throws(
    () => projectRoadMoveSwitching({
      currentPath: ['start'],
      compatibleRoadCardIds: ['road-3', 'road-3'],
    }),
    /duplicate compatible road card id/,
  );
});

test('Battle-card state is neither read nor mutated by road/move switching', () => {
  const battleState = Object.freeze({ selectedBattleCardId: 'battle-7', reserved: false });
  const context = Object.freeze({ battleState });
  const path = Object.freeze(['start', 'n1', 'n2']);
  const view = projectRoadMoveSwitching({
    currentPath: path,
    compatibleRoadCardIds: ['road-3', 'road-5'],
  });

  transitionRoadMoveSwitching(view, { type: 'FOCUS_ROAD_CARD', cardId: 'road-5' });
  assert.strictEqual(context.battleState, battleState);
  assert.deepEqual(context.battleState, { selectedBattleCardId: 'battle-7', reserved: false });
});
