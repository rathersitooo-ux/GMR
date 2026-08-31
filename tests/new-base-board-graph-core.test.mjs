import test from 'node:test';
import assert from 'node:assert/strict';
import { composeNewBaseBoardGraph } from '../browser/new-base-board-graph-core.mjs';
import { projectBattleBoardVisualExplanation } from '../browser/battle-board-visual-explanation-core.mjs';

test('composes externally supplied zone positions in stable zone order', () => {
  const graph = composeNewBaseBoardGraph({
    goalPositionIds: ['goal:a'],
    shieldPositionIds: ['shield:a'],
    roadSlotPositionIds: ['road:a:1', 'road:a:2'],
    fieldPositionIds: ['field:a'],
    revisionToken: 'board-r1',
  });

  assert.equal(graph.ok, true);
  assert.deepEqual(graph.validPositionIds, ['goal:a', 'shield:a', 'road:a:1', 'road:a:2', 'field:a']);
  assert.deepEqual(graph.zonePositionIds, {
    goal: ['goal:a'],
    shield: ['shield:a'],
    roadSlot: ['road:a:1', 'road:a:2'],
    field: ['field:a'],
  });
  assert.deepEqual(graph.positionKindByPosition, {
    'goal:a': 'GOAL',
    'shield:a': 'SHIELD',
    'road:a:1': 'ROAD_SLOT',
    'road:a:2': 'ROAD_SLOT',
    'field:a': 'FIELD',
  });
  assert.equal(graph.revisionToken, 'board-r1');
});

test('allows partial zone producers without inventing missing positions', () => {
  const graph = composeNewBaseBoardGraph({ roadSlotPositionIds: ['road:a:1'] });

  assert.equal(graph.ok, true);
  assert.deepEqual(graph.validPositionIds, ['road:a:1']);
  assert.deepEqual(graph.zonePositionIds.goal, []);
  assert.deepEqual(graph.zonePositionIds.shield, []);
  assert.deepEqual(graph.zonePositionIds.field, []);
});

test('preserves explicit adjacency and never auto-symmetrizes it', () => {
  const graph = composeNewBaseBoardGraph({
    roadSlotPositionIds: ['road:a:1'],
    fieldPositionIds: ['field:a'],
    adjacencyByPosition: {
      'field:a': ['road:a:1', 'road:a:1'],
    },
  });

  assert.equal(graph.ok, true);
  assert.deepEqual(graph.adjacencyByPosition['field:a'], ['road:a:1']);
  assert.deepEqual(graph.adjacencyByPosition['road:a:1'], []);
});

test('does not forbid an explicit self-reference because movement legality is external', () => {
  const graph = composeNewBaseBoardGraph({
    fieldPositionIds: ['field:a'],
    adjacencyByPosition: { 'field:a': ['field:a'] },
  });

  assert.equal(graph.ok, true);
  assert.deepEqual(graph.adjacencyByPosition['field:a'], ['field:a']);
});

test('fails closed on duplicate position identity across zones', () => {
  const graph = composeNewBaseBoardGraph({
    shieldPositionIds: ['shared:a'],
    roadSlotPositionIds: ['shared:a'],
  });

  assert.equal(graph.ok, false);
  assert.equal(graph.reason, 'DUPLICATE_POSITION_ID');
  assert.deepEqual(graph.validPositionIds, []);
});

test('fails closed when adjacency references a position no producer supplied', () => {
  const graph = composeNewBaseBoardGraph({
    fieldPositionIds: ['field:a'],
    adjacencyByPosition: { 'field:a': ['road:missing'] },
  });

  assert.equal(graph.ok, false);
  assert.equal(graph.reason, 'UNKNOWN_POSITION_ID');
});

test('fails closed when adjacency declares an unknown source position', () => {
  const graph = composeNewBaseBoardGraph({
    fieldPositionIds: ['field:a'],
    adjacencyByPosition: { 'ghost:a': [] },
  });

  assert.equal(graph.ok, false);
  assert.equal(graph.reason, 'UNKNOWN_POSITION_ID');
});

test('fails closed on empty graph instead of claiming a usable board', () => {
  const graph = composeNewBaseBoardGraph();
  assert.equal(graph.ok, false);
  assert.equal(graph.reason, 'NO_POSITIONS');
});

test('resulting validPositionIds plug into the existing board visual projection', () => {
  const graph = composeNewBaseBoardGraph({
    shieldPositionIds: ['shield:a'],
    roadSlotPositionIds: ['road:a:1'],
    fieldPositionIds: ['field:a'],
  });
  const visual = projectBattleBoardVisualExplanation({
    validPositionIds: graph.validPositionIds,
    currentPositionId: 'field:a',
    reachablePositionIds: ['road:a:1'],
  });

  assert.equal(graph.ok, true);
  assert.equal(visual.ok, true);
  assert.deepEqual(visual.channels.current, ['field:a']);
  assert.deepEqual(visual.channels.reachable, ['road:a:1']);
});

test('returned graph data is immutable at the composition boundary', () => {
  const graph = composeNewBaseBoardGraph({ fieldPositionIds: ['field:a'] });

  assert.equal(Object.isFrozen(graph), true);
  assert.equal(Object.isFrozen(graph.validPositionIds), true);
  assert.equal(Object.isFrozen(graph.zonePositionIds), true);
  assert.equal(Object.isFrozen(graph.adjacencyByPosition), true);
  assert.equal(Object.isFrozen(graph.adjacencyByPosition['field:a']), true);
});
