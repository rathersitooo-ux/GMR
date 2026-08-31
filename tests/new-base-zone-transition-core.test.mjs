import test from 'node:test';
import assert from 'node:assert/strict';

import { composeNewBaseZoneTransitions } from '../browser/new-base-zone-transition-core.mjs';

const validPositionIds = ['F:1', 'F:2', 'R:1', 'R:7', 'S:1', 'G:1'];
const positionKindByPosition = {
  'F:1': 'FIELD',
  'F:2': 'FIELD',
  'R:1': 'ROAD_SLOT',
  'R:7': 'ROAD_SLOT',
  'S:1': 'SHIELD',
  'G:1': 'GOAL',
};
const adjacencyByPosition = {
  'F:1': ['F:2'],
  'R:1': ['R:7'],
};

function compose(transitions) {
  return composeNewBaseZoneTransitions({
    validPositionIds,
    positionKindByPosition,
    adjacencyByPosition,
    transitions,
  });
}

test('composes explicit FIELD -> ROAD_SLOT -> SHIELD -> GOAL edges', () => {
  const result = compose([
    { from: 'F:2', to: 'R:7' },
    { from: 'R:1', to: 'S:1' },
    { from: 'S:1', to: 'G:1' },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.appliedTransitionCount, 3);
  assert.deepEqual(result.adjacencyByPosition['F:1'], ['F:2']);
  assert.deepEqual(result.adjacencyByPosition['F:2'], ['R:7']);
  assert.deepEqual(result.adjacencyByPosition['R:1'], ['R:7', 'S:1']);
  assert.deepEqual(result.adjacencyByPosition['S:1'], ['G:1']);
});

test('does not invent reverse edges', () => {
  const result = compose([{ from: 'F:2', to: 'R:7' }]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.adjacencyByPosition['R:7'], []);
});

test('adds reverse edge only when caller explicitly requests bidirectional', () => {
  const result = compose([{ from: 'F:2', to: 'R:7', bidirectional: true }]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.adjacencyByPosition['F:2'], ['R:7']);
  assert.deepEqual(result.adjacencyByPosition['R:7'], ['F:2']);
});

test('closed caller gate leaves Shield -> GOAL disconnected', () => {
  const result = compose([{ from: 'S:1', to: 'G:1', enabled: false }]);
  assert.equal(result.ok, true);
  assert.equal(result.appliedTransitionCount, 0);
  assert.deepEqual(result.adjacencyByPosition['S:1'], []);
  assert.deepEqual(result.adjacencyByPosition['G:1'], []);
});

test('rejects a skipped-layer FIELD -> SHIELD transition', () => {
  const result = compose([{ from: 'F:2', to: 'S:1' }]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'INVALID_ZONE_TRANSITION');
});

test('rejects pre-baked cross-zone adjacency so transition authority stays explicit', () => {
  const result = composeNewBaseZoneTransitions({
    validPositionIds,
    positionKindByPosition,
    adjacencyByPosition: { 'F:2': ['R:7'] },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'CROSS_ZONE_EDGE_MUST_BE_EXPLICIT');
});

test('rejects unknown positions instead of inventing graph nodes', () => {
  const result = compose([{ from: 'F:2', to: 'R:missing' }]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'UNKNOWN_POSITION_ID');
});
