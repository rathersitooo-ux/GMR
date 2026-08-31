import test from 'node:test';
import assert from 'node:assert/strict';

import { createNewBaseField } from '../browser/new-base-field-core.mjs';
import {
  D06_COLLISION_KIND,
  evaluateH02PathHistoryForD06,
} from '../browser/auto-rank-d06-collision-contract.mjs';

test('preserves caller-owned opaque FIELD ids, order, and explicit one-way adjacency', () => {
  const actual = createNewBaseField({
    fieldPositionIds: ['alpha', 'ROAD:looks-like-a-road-but-is-field', 'omega'],
    adjacencyByPosition: {
      alpha: ['ROAD:looks-like-a-road-but-is-field'],
      'ROAD:looks-like-a-road-but-is-field': ['omega'],
    },
  });

  assert.equal(actual.ok, true);
  assert.equal(actual.reason, null);
  assert.equal(actual.schema, 'gameroad.new-base-field.v1');
  assert.deepEqual(actual.fieldPositionIds, [
    'alpha',
    'ROAD:looks-like-a-road-but-is-field',
    'omega',
  ]);
  assert.deepEqual(actual.adjacencyByPosition, {
    alpha: ['ROAD:looks-like-a-road-but-is-field'],
    'ROAD:looks-like-a-road-but-is-field': ['omega'],
    omega: [],
  });
  assert.equal(Object.isFrozen(actual), true);
  assert.equal(Object.isFrozen(actual.fieldPositionIds), true);
  assert.equal(Object.isFrozen(actual.adjacencyByPosition), true);
  assert.equal(Object.isFrozen(actual.adjacencyByPosition.alpha), true);
});

test('never infers reverse FIELD edges or missing adjacency', () => {
  const actual = createNewBaseField({
    fieldPositionIds: ['A', 'B', 'C'],
    adjacencyByPosition: { A: ['B'] },
  });

  assert.equal(actual.ok, true);
  assert.deepEqual(actual.adjacencyByPosition, {
    A: ['B'],
    B: [],
    C: [],
  });
});

test('fails closed on missing, malformed, or duplicate FIELD position ids', () => {
  const cases = [
    [undefined, 'INVALID_FIELD_POSITION_LIST'],
    [[], 'NO_FIELD_POSITIONS'],
    [['A', ''], 'INVALID_FIELD_POSITION_ID'],
    [['A', ' A'], 'INVALID_FIELD_POSITION_ID'],
    [['A', 'A'], 'DUPLICATE_FIELD_POSITION_ID'],
  ];

  for (const [fieldPositionIds, reason] of cases) {
    const actual = createNewBaseField({ fieldPositionIds });
    assert.equal(actual.ok, false);
    assert.equal(actual.reason, reason);
    assert.deepEqual(actual.fieldPositionIds, []);
    assert.deepEqual(actual.adjacencyByPosition, {});
  }
});

test('fails closed on unknown FIELD adjacency sources or targets', () => {
  const unknownSource = createNewBaseField({
    fieldPositionIds: ['A', 'B'],
    adjacencyByPosition: { X: ['A'] },
  });
  assert.equal(unknownSource.ok, false);
  assert.equal(unknownSource.reason, 'UNKNOWN_FIELD_POSITION_ID');

  const unknownTarget = createNewBaseField({
    fieldPositionIds: ['A', 'B'],
    adjacencyByPosition: { A: ['X'] },
  });
  assert.equal(unknownTarget.ok, false);
  assert.equal(unknownTarget.reason, 'UNKNOWN_FIELD_POSITION_ID');
});

test('fails closed on malformed or duplicate adjacency declarations', () => {
  const malformed = createNewBaseField({
    fieldPositionIds: ['A', 'B'],
    adjacencyByPosition: { A: 'B' },
  });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.reason, 'INVALID_FIELD_ADJACENCY');

  const duplicateTarget = createNewBaseField({
    fieldPositionIds: ['A', 'B'],
    adjacencyByPosition: { A: ['B', 'B'] },
  });
  assert.equal(duplicateTarget.ok, false);
  assert.equal(duplicateTarget.reason, 'DUPLICATE_FIELD_ADJACENCY_TARGET');
});

test('FIELD opaque ids feed the existing shared D06 path-history collision contract unchanged', () => {
  const field = createNewBaseField({
    fieldPositionIds: ['field-left', 'field-right'],
    adjacencyByPosition: {
      'field-left': ['field-right'],
      'field-right': ['field-left'],
    },
  });
  assert.equal(field.ok, true);

  const actual = evaluateH02PathHistoryForD06(
    field.fieldPositionIds,
    [...field.fieldPositionIds].reverse(),
  );

  assert.equal(actual.valid, true);
  assert.equal(actual.failures.length, 1);
  assert.equal(actual.failures[0].collisionKind, D06_COLLISION_KIND.SWAP);
  assert.equal(actual.failures[0].applyReservation, false);
  assert.equal(actual.failures[0].keepStartPosition, true);
  assert.equal(actual.failures[0].honeyDelta, 0);
  assert.equal(actual.failures[0].manaDelta, 0);
});
