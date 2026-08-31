import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const corePath = process.env.CORE_UNDER_TEST || path.resolve(import.meta.dirname, '../browser/battle-road-move-draft-core.mjs');
const { compatibleRoadCard, projectDraftMoveRoadCards } = await import(pathToFileURL(corePath).href + `?v=${Date.now()}`);

const road = (value) => ({ id: `road-${value}`, roadValue: value });
const pathForSteps = (steps) => Array.from({ length: steps + 1 }, (_, index) => `P:${index}`);
const board = (overrides = {}) => ({
  pathLegal: true,
  pathStoppable: true,
  boardVersion: 'board-17',
  currentBoardVersion: 'board-17',
  ...overrides,
});

function draft(steps, handRoadCards, overrides = {}) {
  return projectDraftMoveRoadCards({
    currentPath: pathForSteps(steps),
    handRoadCards,
    boardState: board(),
    ...overrides,
  });
}

test('move first: two steps exposes every compatible held Road card and chooses none', () => {
  const out = draft(2, [road(1), road(3), road(5)]);
  assert.equal(out.ok, true);
  assert.equal(out.stepCount, 2);
  assert.deepEqual(out.compatibleRoadCardIds, ['road-3', 'road-5']);
  assert.equal(out.focusedRoadCardId, null);
  assert.equal(out.committedRoadCardId, null);
  assert.equal(out.autoSelect, false);
  assert.equal(out.autoSubmit, false);
});

test('multiple compatible candidates stay simultaneous instead of being AI-selected', () => {
  const out = draft(2, [road(3), road(5), road(6)]);
  assert.deepEqual(out.compatibleRoadCardIds, ['road-3', 'road-5', 'road-6']);
  assert.equal(out.focusedRoadCardId, null);
  assert.equal(out.committedRoadCardId, null);
});

test('backtracking recomputes from the current path and immediately expands the candidate set', () => {
  const hand = [road(2), road(4), road(5), road(6)];
  assert.deepEqual(draft(5, hand).compatibleRoadCardIds, ['road-5', 'road-6']);
  assert.deepEqual(draft(4, hand).compatibleRoadCardIds, ['road-4', 'road-5', 'road-6']);
  assert.deepEqual(draft(2, hand).compatibleRoadCardIds, ['road-2', 'road-4', 'road-5', 'road-6']);
});

test('normal Road value is an upper bound, never an exact-distance requirement', () => {
  for (let steps = 1; steps <= 5; steps += 1) {
    assert.equal(compatibleRoadCard(road(5), pathForSteps(steps), board()), true, `Road5 should cover ${steps} step(s)`);
  }
  assert.equal(compatibleRoadCard(road(5), pathForSteps(6), board()), false);
});

test('Road 1-6 share one parameterized compatibility rule', () => {
  for (let value = 1; value <= 6; value += 1) {
    for (let steps = 0; steps <= 6; steps += 1) {
      assert.equal(
        compatibleRoadCard(road(value), pathForSteps(steps), board()),
        steps <= value,
        `Road${value} at ${steps} steps`,
      );
    }
  }
});

test('a stale, illegal, or unstoppably projected path fails closed', () => {
  const stale = projectDraftMoveRoadCards({
    currentPath: pathForSteps(2),
    handRoadCards: [road(3)],
    boardState: board({ currentBoardVersion: 'board-18' }),
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'STALE_BOARD_STATE');
  assert.deepEqual(stale.compatibleRoadCardIds, []);

  for (const boardState of [board({ pathLegal: false }), board({ pathStoppable: false })]) {
    const out = projectDraftMoveRoadCards({ currentPath: pathForSteps(2), handRoadCards: [road(3)], boardState });
    assert.equal(out.ok, false);
    assert.deepEqual(out.compatibleRoadCardIds, []);
  }
});

test('battle-card-shaped or Road7+ data cannot enter the normal Road candidate set', () => {
  const invalidBattleLike = projectDraftMoveRoadCards({
    currentPath: pathForSteps(1),
    handRoadCards: [{ id: 'battle-card', battleValue: 6 }],
    boardState: board(),
  });
  assert.equal(invalidBattleLike.ok, false);
  assert.equal(invalidBattleLike.reason, 'INVALID_ROAD_HAND');

  const invalidRoad7 = projectDraftMoveRoadCards({
    currentPath: pathForSteps(1),
    handRoadCards: [{ id: 'road-7', roadValue: 7 }],
    boardState: board(),
  });
  assert.equal(invalidRoad7.ok, false);
  assert.equal(invalidRoad7.reason, 'INVALID_ROAD_HAND');
});

test('unknown battle-card input is ignored rather than becoming a road decision input', () => {
  const out = projectDraftMoveRoadCards({
    currentPath: pathForSteps(2),
    handRoadCards: [road(3), road(5)],
    boardState: board(),
    battleCards: [{ id: 'battle-x', value: 99 }],
  });
  assert.equal(out.ok, true);
  assert.deepEqual(out.compatibleRoadCardIds, ['road-3', 'road-5']);
  assert.equal('battleCards' in out, false);
});
