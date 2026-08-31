import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const corePath = process.env.CORE_UNDER_TEST || path.resolve(import.meta.dirname, '../browser/battle-road-move-draft-core.mjs');
const { projectDraftMoveRoadCards } = await import(pathToFileURL(corePath).href + `?v=${Date.now()}`);

const road = (value) => ({ id: `road-${value}`, roadValue: value });
const pathForSteps = (steps) => Array.from({ length: steps + 1 }, (_, index) => `P:${index}`);
const boardState = Object.freeze({
  pathLegal: true,
  pathStoppable: true,
  boardVersion: 'board-switch-1',
  currentBoardVersion: 'board-switch-1',
});

function project({ currentPath, focusedRoadCardId, handRoadCards }) {
  return projectDraftMoveRoadCards({ currentPath, focusedRoadCardId, handRoadCards, boardState });
}

test('card -> move -> compatible card change preserves the current path and changes only Road focus', () => {
  const hand = [road(1), road(3), road(5)];
  const currentPath = pathForSteps(2);

  const road3 = project({ currentPath, focusedRoadCardId: 'road-3', handRoadCards: hand });
  assert.equal(road3.ok, true);
  assert.equal(road3.focusedRoadCardId, 'road-3');
  assert.equal(road3.focusCompatible, true);
  assert.deepEqual(road3.currentPath, currentPath);
  assert.deepEqual(road3.compatibleRoadCardIds, ['road-3', 'road-5']);

  const road5 = project({ currentPath: road3.currentPath, focusedRoadCardId: 'road-5', handRoadCards: hand });
  assert.equal(road5.ok, true);
  assert.equal(road5.focusedRoadCardId, 'road-5');
  assert.equal(road5.focusCompatible, true);
  assert.deepEqual(road5.currentPath, currentPath);
  assert.deepEqual(road5.currentPath, road3.currentPath);
  assert.deepEqual(road5.compatibleRoadCardIds, ['road-3', 'road-5']);
  assert.equal(road5.committedRoadCardId, null);
  assert.equal(road5.autoSelect, false);
  assert.equal(road5.autoSubmit, false);

  assert.deepEqual(currentPath, pathForSteps(2), 'caller-owned path must not be mutated');
});

test('switching focus to an insufficient held Road card keeps the path and exposes invalid focus without fallback selection', () => {
  const hand = [road(1), road(3), road(5)];
  const currentPath = pathForSteps(2);

  const out = project({ currentPath, focusedRoadCardId: 'road-1', handRoadCards: hand });
  assert.equal(out.ok, true);
  assert.equal(out.focusedRoadCardId, 'road-1');
  assert.equal(out.focusCompatible, false);
  assert.deepEqual(out.currentPath, currentPath);
  assert.deepEqual(out.compatibleRoadCardIds, ['road-3', 'road-5']);
  assert.equal(out.committedRoadCardId, null);
  assert.equal(out.autoSelect, false);
  assert.equal(out.autoSubmit, false);
});

test('Road focus switching never creates or mutates Battle-card decision state', () => {
  const out = project({
    currentPath: pathForSteps(2),
    focusedRoadCardId: 'road-5',
    handRoadCards: [road(3), road(5)],
  });

  for (const key of ['battleCardId', 'selectedBattleCardId', 'reservedBattleCardId', 'submittedBattleCardId']) {
    assert.equal(key in out, false, `${key} must stay outside DraftMove Road projection`);
  }
  assert.equal(out.committedRoadCardId, null);
  assert.equal(out.autoSubmit, false);
});
