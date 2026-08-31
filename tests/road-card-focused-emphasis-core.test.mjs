import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ROAD_CARD_FOCUSED_EMPHASIS,
  applyRoadCardFocusedEmphasis,
} from '../browser/road-card-focused-emphasis-core.mjs';

test('FOCUSED is visibly stronger than the same COMPATIBLE baseline without changing semantic state', () => {
  const compatibleBaseline = Object.freeze({
    state: 'COMPATIBLE',
    liftPx: -5,
    scale: 1.02,
    outlineWidthPx: 2,
    brightness: 1.04,
    contrast: 1.01,
  });
  const focusedInput = Object.freeze({
    ...compatibleBaseline,
    state: 'FOCUSED',
    roadCardId: 'ROAD_3',
  });

  const focused = applyRoadCardFocusedEmphasis(focusedInput);

  assert.equal(focused.state, 'FOCUSED');
  assert.equal(focused.visualEmphasis, 'FOCUSED');
  assert.equal(focused.roadCardId, 'ROAD_3');
  assert.ok(focused.liftPx < compatibleBaseline.liftPx);
  assert.ok(focused.scale > compatibleBaseline.scale);
  assert.ok(focused.outlineWidthPx > compatibleBaseline.outlineWidthPx);
  assert.ok(focused.brightness > compatibleBaseline.brightness);
  assert.ok(focused.contrast > compatibleBaseline.contrast);
  assert.deepEqual(focusedInput, {
    ...compatibleBaseline,
    state: 'FOCUSED',
    roadCardId: 'ROAD_3',
  });
});

test('Reduced Motion removes transition but preserves static non-color distinction', () => {
  const focused = applyRoadCardFocusedEmphasis({
    state: 'FOCUSED',
    liftPx: -4,
    scale: 1,
    outlineWidthPx: 1,
    brightness: 1,
    contrast: 1,
  }, { reducedMotion: true });

  assert.equal(focused.transitionDurationMs, 0);
  assert.equal(focused.liftPx, -10);
  assert.equal(focused.scale, 1.02);
  assert.equal(focused.outlineWidthPx, 2);
  assert.ok(focused.brightness > 1);
  assert.ok(focused.contrast > 1);
});

test('only explicit semantic FOCUSED presentations can receive this emphasis', () => {
  assert.throws(
    () => applyRoadCardFocusedEmphasis({ state: 'COMPATIBLE' }),
    /FOCUSED_ROAD_CARD_PRESENTATION_REQUIRED/,
  );
  assert.throws(
    () => applyRoadCardFocusedEmphasis({ state: 'INVALID_FOCUS' }),
    /FOCUSED_ROAD_CARD_PRESENTATION_REQUIRED/,
  );
});

test('Road1 through Road6 use one parameterized emphasis contract', () => {
  for (let value = 1; value <= 6; value += 1) {
    const focused = applyRoadCardFocusedEmphasis({
      state: 'FOCUSED',
      roadCardId: `ROAD_${value}`,
    });

    assert.equal(focused.roadCardId, `ROAD_${value}`);
    assert.equal(focused.liftPx, ROAD_CARD_FOCUSED_EMPHASIS.liftDeltaPx);
    assert.equal(focused.scale, ROAD_CARD_FOCUSED_EMPHASIS.scaleMultiplier);
    assert.equal(focused.outlineWidthPx, ROAD_CARD_FOCUSED_EMPHASIS.outlineBoostPx);
  }
});

test('presentation overlay emits no selection, reservation, submission or Battle-card effects', () => {
  const focused = applyRoadCardFocusedEmphasis({ state: 'FOCUSED', roadCardId: 'ROAD_5' });
  const forbiddenKeys = [
    'selectedRoadCard',
    'selectionEffect',
    'reservationEffect',
    'submitEffect',
    'battleCard',
    'battleCardSelection',
  ];

  for (const key of forbiddenKeys) assert.equal(Object.hasOwn(focused, key), false);
});
