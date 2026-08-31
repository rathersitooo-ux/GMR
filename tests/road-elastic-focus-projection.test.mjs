import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const corePath = process.env.CORE_UNDER_TEST || path.resolve(import.meta.dirname, '../browser/road-elastic-focus-projection.mjs');
const { projectElasticFocus } = await import(pathToFileURL(corePath).href + `?v=${Date.now()}`);

const r1 = { id: 'road-1', value: 1 };
const r3 = { id: 'road-3', value: 3 };
const r5 = { id: 'road-5', value: 5 };
const r6 = { id: 'road-6', value: 6 };

function board() {
  return {
    sameRoadCard: (a, b) => a.id === b.id,
    roadValueOf: card => card.value,
  };
}

function reachable(card) {
  return Array.from({ length: card.value }, (_, index) => `P${index + 1}`);
}

function ids(cards) {
  return cards.map(card => card.id);
}

test('Road3 focus keeps 1-3 strong and exposes only Road5 extension positions as weak', () => {
  const currentPath = ['A', 'B'];
  const out = projectElasticFocus({
    handRoadCards: [r1, r3, r5],
    compatibleRoadCards: [r3, r5],
    currentPath,
    focusedRoadCard: r3,
    focusState: 'FOCUSED',
    boardState: board(),
    reachableForCard: reachable,
  });

  assert.equal(out.ok, true);
  assert.equal(out.focusState, 'FOCUSED');
  assert.deepEqual(out.strongReachablePositionIds, ['P1', 'P2', 'P3']);
  assert.deepEqual(out.expandableReachablePositionIds, ['P4', 'P5']);
  assert.deepEqual(ids(out.extensionRoadCards), ['road-5']);
  assert.deepEqual(ids(out.switchRoadCards), ['road-5']);
  assert.equal(out.currentPath, currentPath);
  assert.equal(out.pathMutation, 'none');
  assert.equal(out.autoSelectedRoadCard, null);
  assert.equal(out.formalSelectionChanged, false);
  assert.equal(out.interactionMode, null);
});

test('extending beyond Road3 preserves the four-step path and marks focus invalid without auto-switching to Road5', () => {
  const currentPath = ['A', 'B', 'C', 'D'];
  const out = projectElasticFocus({
    handRoadCards: [r1, r3, r5],
    compatibleRoadCards: [r5],
    currentPath,
    focusedRoadCard: r3,
    focusState: 'INVALID_FOCUS',
    boardState: board(),
    reachableForCard: reachable,
  });

  assert.equal(out.ok, true);
  assert.equal(out.focusState, 'INVALID_FOCUS');
  assert.deepEqual(out.strongReachablePositionIds, []);
  assert.deepEqual(out.expandableReachablePositionIds, ['P1', 'P2', 'P3', 'P4', 'P5']);
  assert.deepEqual(ids(out.switchRoadCards), ['road-5']);
  assert.deepEqual(ids(out.extensionRoadCards), ['road-5']);
  assert.equal(out.currentPath, currentPath);
  assert.equal(out.preserveCurrentPath, true);
  assert.equal(out.focusAutoCleared, false);
  assert.equal(out.autoSelectedRoadCard, null);
});

test('multiple larger alternatives remain visible together and are never collapsed to one automatic choice', () => {
  const out = projectElasticFocus({
    handRoadCards: [r3, r5, r6],
    compatibleRoadCards: [r3, r5, r6],
    currentPath: ['A', 'B'],
    focusedRoadCard: r3,
    focusState: 'FOCUSED',
    boardState: board(),
    reachableForCard: reachable,
  });

  assert.deepEqual(ids(out.extensionRoadCards), ['road-5', 'road-6']);
  assert.deepEqual(ids(out.switchRoadCards), ['road-5', 'road-6']);
  assert.deepEqual(out.expandableReachablePositionIds, ['P4', 'P5', 'P6']);
  assert.equal(out.autoSelectedRoadCard, null);
});

test('a missing focused card is treated as invalid while current compatible candidates and path are retained', () => {
  const staleR3 = { id: 'road-3', value: 3 };
  const currentPath = ['A', 'B'];
  const out = projectElasticFocus({
    handRoadCards: [r5],
    compatibleRoadCards: [r5],
    currentPath,
    focusedRoadCard: staleR3,
    focusState: 'FOCUSED',
    boardState: board(),
    reachableForCard: reachable,
  });

  assert.equal(out.focusState, 'INVALID_FOCUS');
  assert.deepEqual(ids(out.switchRoadCards), ['road-5']);
  assert.deepEqual(ids(out.extensionRoadCards), ['road-5']);
  assert.equal(out.currentPath, currentPath);
  assert.equal(out.focusAutoCleared, false);
  assert.equal(out.autoSelectedRoadCard, null);
});

test('overlapping reachable targets are removed from weak range rather than duplicated', () => {
  const out = projectElasticFocus({
    handRoadCards: [r3, r5],
    compatibleRoadCards: [r3, r5],
    currentPath: ['A'],
    focusedRoadCard: r3,
    focusState: 'FOCUSED',
    boardState: board(),
    reachableForCard: card => card === r3
      ? [{ id: 'P1' }, { id: 'P2' }, { id: 'P3' }]
      : [{ id: 'P2' }, { id: 'P3' }, { id: 'P4' }, { id: 'P5' }],
    targetKeyOf: target => target.id,
  });

  assert.deepEqual(out.strongReachablePositionIds.map(target => target.id), ['P1', 'P2', 'P3']);
  assert.deepEqual(out.expandableReachablePositionIds.map(target => target.id), ['P4', 'P5']);
});

test('no focused card creates no separate mode and does not invent strong or expandable ranges', () => {
  const currentPath = ['A', 'B'];
  const out = projectElasticFocus({
    handRoadCards: [r3, r5],
    compatibleRoadCards: [r3, r5],
    currentPath,
    focusedRoadCard: null,
    focusState: null,
    boardState: board(),
    reachableForCard: reachable,
  });

  assert.equal(out.ok, true);
  assert.equal(out.focusState, null);
  assert.deepEqual(out.strongReachablePositionIds, []);
  assert.deepEqual(out.expandableReachablePositionIds, []);
  assert.deepEqual(ids(out.switchRoadCards), ['road-3', 'road-5']);
  assert.equal(out.currentPath, currentPath);
  assert.equal(out.interactionMode, null);
  assert.equal(out.autoSelectedRoadCard, null);
});

test('invalid inputs fail closed without changing path or selecting a card', () => {
  const currentPath = ['A'];
  const out = projectElasticFocus({
    handRoadCards: [r3],
    compatibleRoadCards: [r3],
    currentPath,
    focusedRoadCard: r3,
    focusState: 'FOCUSED',
    boardState: {},
    reachableForCard: reachable,
  });

  assert.equal(out.ok, false);
  assert.equal(out.reason, 'FOCUSED_ROAD_VALUE_UNAVAILABLE');
  assert.equal(out.currentPath, currentPath);
  assert.equal(out.pathMutation, 'none');
  assert.equal(out.autoSelectedRoadCard, null);
});
