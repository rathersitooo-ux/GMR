import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ROAD_CARD_COMPATIBLE_CLASS,
  ROAD_CARD_VISUAL_STATE,
  projectRoadCardCompatibleGlow,
} from '../browser/road-card-compatible-glow-projection.mjs';

const ROAD_IDS = ['road-1', 'road-2', 'road-3', 'road-4', 'road-5', 'road-6'];

function byId(result) {
  return Object.fromEntries(result.map((entry) => [entry.cardId, entry]));
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
    assert.deepEqual(entry.classNames, []);
    assert.equal(entry.presentation.haloLayerCount, 0);
  }
});

test('one compatible card gets static outline + brightness + halo without lift', () => {
  const result = byId(projectRoadCardCompatibleGlow({
    roadCardIds: ['road-1', 'road-3', 'road-5'],
    compatibleRoadCardIds: ['road-3'],
  }));

  assert.equal(result['road-1'].visualState, ROAD_CARD_VISUAL_STATE.NORMAL);
  assert.equal(result['road-5'].visualState, ROAD_CARD_VISUAL_STATE.NORMAL);
  assert.equal(result['road-3'].visualState, ROAD_CARD_VISUAL_STATE.COMPATIBLE);
  assert.equal(result['road-3'].applyCompatibleGlow, true);
  assert.deepEqual(result['road-3'].classNames, [ROAD_CARD_COMPATIBLE_CLASS]);
  assert.ok(result['road-3'].presentation.outlineWidthPx > 0);
  assert.ok(result['road-3'].presentation.brightnessMultiplier > 1);
  assert.ok(result['road-3'].presentation.haloLayerCount > 0);
  assert.equal(result['road-3'].presentation.animated, false);

  for (const key of Object.keys(result['road-3'].presentation)) {
    assert.doesNotMatch(key, /transform|translate|lift/i);
  }
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

test('FOCUSED presentation keeps precedence while compatibility remains observable', () => {
  const result = byId(projectRoadCardCompatibleGlow({
    roadCardIds: ['road-3', 'road-5'],
    compatibleRoadCardIds: ['road-3', 'road-5'],
    focusedRoadCardId: 'road-3',
  }));

  assert.equal(result['road-3'].compatible, true);
  assert.equal(result['road-3'].visualState, ROAD_CARD_VISUAL_STATE.FOCUSED);
  assert.equal(result['road-3'].applyCompatibleGlow, false);
  assert.deepEqual(result['road-3'].classNames, []);
  assert.equal(result['road-5'].visualState, ROAD_CARD_VISUAL_STATE.COMPATIBLE);
  assert.equal(result['road-5'].applyCompatibleGlow, true);
});

test('INVALID_FOCUS presentation keeps precedence and cannot also be compatible', () => {
  const result = byId(projectRoadCardCompatibleGlow({
    roadCardIds: ['road-3', 'road-5'],
    compatibleRoadCardIds: ['road-5'],
    invalidFocusedRoadCardId: 'road-3',
  }));

  assert.equal(result['road-3'].compatible, false);
  assert.equal(result['road-3'].visualState, ROAD_CARD_VISUAL_STATE.INVALID_FOCUS);
  assert.equal(result['road-3'].applyCompatibleGlow, false);
  assert.equal(result['road-5'].applyCompatibleGlow, true);

  assert.throws(() => projectRoadCardCompatibleGlow({
    roadCardIds: ['road-3', 'road-5'],
    compatibleRoadCardIds: ['road-3'],
    invalidFocusedRoadCardId: 'road-3',
  }), /INVALID_FOCUS cannot simultaneously be COMPATIBLE/);
});

test('Reduced Motion removes transition motion; LowPerf uses one static halo layer', () => {
  const reduced = byId(projectRoadCardCompatibleGlow({
    roadCardIds: ['road-5'],
    compatibleRoadCardIds: ['road-5'],
    reducedMotion: true,
  }))['road-5'];
  assert.equal(reduced.presentation.transitionMs, 0);
  assert.equal(reduced.presentation.animated, false);

  const lowPerf = byId(projectRoadCardCompatibleGlow({
    roadCardIds: ['road-5'],
    compatibleRoadCardIds: ['road-5'],
    lowPerf: true,
  }))['road-5'];
  assert.equal(lowPerf.presentation.haloLayerCount, 1);
  assert.equal(lowPerf.presentation.animated, false);
  assert.ok(lowPerf.presentation.haloBlurPx < reduced.presentation.haloBlurPx);
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
