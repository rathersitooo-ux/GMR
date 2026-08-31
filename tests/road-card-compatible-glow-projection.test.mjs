import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ROAD_CARD_COMPATIBLE_CLASS,
  ROAD_CARD_FOCUSED_CLASS,
  ROAD_CARD_INVALID_FOCUS_CLASS,
  ROAD_CARD_VISUAL_STATE,
  projectRoadCardCompatibleGlow,
} from '../browser/road-card-compatible-glow-projection.mjs';

const ROAD_IDS = ['road-1', 'road-2', 'road-3', 'road-4', 'road-5', 'road-6'];

function byId(result) {
  return Object.fromEntries(result.map((entry) => [entry.cardId, entry]));
}

function assertNoTransformPresentation(entry) {
  for (const key of Object.keys(entry.presentation)) {
    assert.doesNotMatch(key, /transform|translate|lift/i);
  }
}

test('zero compatible cards keeps every Road card NORMAL', () => {
  const result = projectRoadCardCompatibleGlow({
    roadCardIds: ROAD_IDS,
    compatibleRoadCardIds: [],
  });

  for (const entry of result) {
    assert.equal(entry.compatible, false);
    assert.equal(entry.visualState, ROAD_CARD_VISUAL_STATE.NORMAL);
    assert.equal(entry.applyCompatibleGlow, false);
    assert.equal(entry.applyFocusedEmphasis, false);
    assert.equal(entry.applyInvalidFocusEmphasis, false);
    assert.deepEqual(entry.classNames, []);
    assert.equal(entry.presentation.haloLayerCount, 0);
  }
});

test('one compatible card preserves the existing static glow without lift', () => {
  const result = byId(projectRoadCardCompatibleGlow({
    roadCardIds: ['road-1', 'road-3', 'road-5'],
    compatibleRoadCardIds: ['road-3'],
  }));

  assert.equal(result['road-1'].visualState, ROAD_CARD_VISUAL_STATE.NORMAL);
  assert.equal(result['road-5'].visualState, ROAD_CARD_VISUAL_STATE.NORMAL);
  assert.equal(result['road-3'].visualState, ROAD_CARD_VISUAL_STATE.COMPATIBLE);
  assert.equal(result['road-3'].applyCompatibleGlow, true);
  assert.equal(result['road-3'].applyFocusedEmphasis, false);
  assert.deepEqual(result['road-3'].classNames, [ROAD_CARD_COMPATIBLE_CLASS]);
  assert.equal(result['road-3'].presentation.edgeEmphasis, 'strong');
  assert.equal(result['road-3'].presentation.outlineWidthPx, 3);
  assert.equal(result['road-3'].presentation.brightnessMultiplier, 1.12);
  assert.equal(result['road-3'].presentation.haloLayerCount, 2);
  assert.equal(result['road-3'].presentation.haloBlurPx, 16);
  assert.equal(result['road-3'].presentation.haloOpacity, 0.82);
  assert.equal(result['road-3'].presentation.animated, false);
  assertNoTransformPresentation(result['road-3']);
});

test('multiple compatible cards all glow and no candidate is auto-chosen', () => {
  const result = byId(projectRoadCardCompatibleGlow({
    roadCardIds: ['road-1', 'road-3', 'road-5'],
    compatibleRoadCardIds: ['road-3', 'road-5'],
  }));

  assert.equal(result['road-1'].applyCompatibleGlow, false);
  assert.equal(result['road-3'].applyCompatibleGlow, true);
  assert.equal(result['road-5'].applyCompatibleGlow, true);
  assert.equal(result['road-3'].visualState, ROAD_CARD_VISUAL_STATE.COMPATIBLE);
  assert.equal(result['road-5'].visualState, ROAD_CARD_VISUAL_STATE.COMPATIBLE);
});

test('Road1 through Road6 use the same presentation path', () => {
  for (const candidateId of ROAD_IDS) {
    const result = byId(projectRoadCardCompatibleGlow({
      roadCardIds: ROAD_IDS,
      compatibleRoadCardIds: [candidateId],
    }));

    for (const id of ROAD_IDS) {
      assert.equal(result[id].applyCompatibleGlow, id === candidateId);
      assert.equal(
        result[id].visualState,
        id === candidateId ? ROAD_CARD_VISUAL_STATE.COMPATIBLE : ROAD_CARD_VISUAL_STATE.NORMAL,
      );
    }
  }
});

test('FOCUSED is the primary per-card presentation while compatibility remains observable', () => {
  const result = byId(projectRoadCardCompatibleGlow({
    roadCardIds: ['road-3', 'road-5'],
    compatibleRoadCardIds: ['road-3', 'road-5'],
    focusedRoadCardId: 'road-3',
  }));

  assert.equal(result['road-3'].compatible, true);
  assert.equal(result['road-3'].visualState, ROAD_CARD_VISUAL_STATE.FOCUSED);
  assert.equal(result['road-3'].applyCompatibleGlow, false);
  assert.equal(result['road-3'].applyFocusedEmphasis, true);
  assert.equal(result['road-3'].applyInvalidFocusEmphasis, false);
  assert.deepEqual(result['road-3'].classNames, [ROAD_CARD_FOCUSED_CLASS]);
  assert.equal(result['road-3'].presentation.edgeEmphasis, 'primary');
  assert.equal(result['road-3'].presentation.outlineStyle, 'solid');
  assert.ok(
    result['road-3'].presentation.outlineWidthPx
      > result['road-5'].presentation.outlineWidthPx,
  );
  assert.ok(
    result['road-3'].presentation.brightnessMultiplier
      > result['road-5'].presentation.brightnessMultiplier,
  );
  assert.equal(result['road-5'].visualState, ROAD_CARD_VISUAL_STATE.COMPATIBLE);
  assert.equal(result['road-5'].applyCompatibleGlow, true);
  assertNoTransformPresentation(result['road-3']);
});

test('INVALID_FOCUS uses one non-colour dashed channel and cannot also be compatible', () => {
  const result = byId(projectRoadCardCompatibleGlow({
    roadCardIds: ['road-3', 'road-5'],
    compatibleRoadCardIds: ['road-5'],
    invalidFocusedRoadCardId: 'road-3',
  }));

  assert.equal(result['road-3'].compatible, false);
  assert.equal(result['road-3'].visualState, ROAD_CARD_VISUAL_STATE.INVALID_FOCUS);
  assert.equal(result['road-3'].applyCompatibleGlow, false);
  assert.equal(result['road-3'].applyFocusedEmphasis, false);
  assert.equal(result['road-3'].applyInvalidFocusEmphasis, true);
  assert.deepEqual(result['road-3'].classNames, [ROAD_CARD_INVALID_FOCUS_CLASS]);
  assert.equal(result['road-3'].presentation.outlineStyle, 'dashed');
  assert.equal(result['road-3'].presentation.haloLayerCount, 0);
  assert.equal(result['road-5'].applyCompatibleGlow, true);
  assertNoTransformPresentation(result['road-3']);

  assert.throws(() => projectRoadCardCompatibleGlow({
    roadCardIds: ['road-3', 'road-5'],
    compatibleRoadCardIds: ['road-3'],
    invalidFocusedRoadCardId: 'road-3',
  }), /INVALID_FOCUS cannot simultaneously be COMPATIBLE/);
});

test('focus and invalid emphasis clear completely on the next projection', () => {
  const focused = byId(projectRoadCardCompatibleGlow({
    roadCardIds: ['road-3', 'road-5'],
    compatibleRoadCardIds: ['road-3'],
    focusedRoadCardId: 'road-3',
  }));
  assert.deepEqual(focused['road-3'].classNames, [ROAD_CARD_FOCUSED_CLASS]);

  const invalid = byId(projectRoadCardCompatibleGlow({
    roadCardIds: ['road-3', 'road-5'],
    compatibleRoadCardIds: [],
    invalidFocusedRoadCardId: 'road-5',
  }));
  assert.deepEqual(invalid['road-5'].classNames, [ROAD_CARD_INVALID_FOCUS_CLASS]);

  const cleared = byId(projectRoadCardCompatibleGlow({
    roadCardIds: ['road-3', 'road-5'],
    compatibleRoadCardIds: [],
  }));
  for (const entry of Object.values(cleared)) {
    assert.equal(entry.visualState, ROAD_CARD_VISUAL_STATE.NORMAL);
    assert.equal(entry.applyCompatibleGlow, false);
    assert.equal(entry.applyFocusedEmphasis, false);
    assert.equal(entry.applyInvalidFocusEmphasis, false);
    assert.deepEqual(entry.classNames, []);
    assert.equal(entry.presentation.outlineStyle, 'none');
  }
});

test('Reduced Motion removes transitions and LowPerf preserves state meaning', () => {
  const reducedFocused = byId(projectRoadCardCompatibleGlow({
    roadCardIds: ['road-5'],
    compatibleRoadCardIds: ['road-5'],
    focusedRoadCardId: 'road-5',
    reducedMotion: true,
  }))['road-5'];
  assert.equal(reducedFocused.presentation.transitionMs, 0);
  assert.equal(reducedFocused.presentation.animated, false);
  assert.deepEqual(reducedFocused.classNames, [ROAD_CARD_FOCUSED_CLASS]);

  const lowPerfCompatible = byId(projectRoadCardCompatibleGlow({
    roadCardIds: ['road-5'],
    compatibleRoadCardIds: ['road-5'],
    lowPerf: true,
  }))['road-5'];
  assert.equal(lowPerfCompatible.presentation.outlineWidthPx, 2);
  assert.equal(lowPerfCompatible.presentation.haloLayerCount, 1);
  assert.equal(lowPerfCompatible.presentation.animated, false);
  assert.deepEqual(lowPerfCompatible.classNames, [ROAD_CARD_COMPATIBLE_CLASS]);

  const lowPerfInvalid = byId(projectRoadCardCompatibleGlow({
    roadCardIds: ['road-3'],
    compatibleRoadCardIds: [],
    invalidFocusedRoadCardId: 'road-3',
    lowPerf: true,
  }))['road-3'];
  assert.equal(lowPerfInvalid.presentation.outlineStyle, 'dashed');
  assert.deepEqual(lowPerfInvalid.classNames, [ROAD_CARD_INVALID_FOCUS_CLASS]);
});

test('unknown and duplicate identities fail closed', () => {
  assert.throws(() => projectRoadCardCompatibleGlow({
    roadCardIds: ['road-3', 'road-3'],
    compatibleRoadCardIds: ['road-3'],
  }), /duplicate identity/);

  assert.throws(() => projectRoadCardCompatibleGlow({
    roadCardIds: ['road-3', 'road-5'],
    compatibleRoadCardIds: ['road-5', 'road-5'],
  }), /duplicate identity/);

  assert.throws(() => projectRoadCardCompatibleGlow({
    roadCardIds: ['road-3', 'road-5'],
    compatibleRoadCardIds: ['road-6'],
  }), /unknown road card/);

  assert.throws(() => projectRoadCardCompatibleGlow({
    roadCardIds: ['road-3'],
    compatibleRoadCardIds: [],
    focusedRoadCardId: 'road-5',
  }), /not present in roadCardIds/);

  assert.throws(() => projectRoadCardCompatibleGlow({
    roadCardIds: ['road-3'],
    compatibleRoadCardIds: [],
    focusedRoadCardId: 'road-3',
    invalidFocusedRoadCardId: 'road-3',
  }), /must not identify the same card/);
});

test('projection does not mutate caller-owned arrays', () => {
  const roadCardIds = ['road-1', 'road-3', 'road-5'];
  const compatibleRoadCardIds = ['road-3', 'road-5'];
  const roadBefore = [...roadCardIds];
  const compatibleBefore = [...compatibleRoadCardIds];

  projectRoadCardCompatibleGlow({ roadCardIds, compatibleRoadCardIds });

  assert.deepEqual(roadCardIds, roadBefore);
  assert.deepEqual(compatibleRoadCardIds, compatibleBefore);
});
