import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeDoppelgangerFieldSnapshot,
  resolveDoppelgangerContinuousOnce,
} from '../browser/doppelganger-continuous-rule-core.mjs';

function card({ key, name, printedValue, zone = 'lane', currentValue = printedValue, instanceKey, ...rest }) {
  return { key, instanceKey, name, printedValue, currentValue, zone, ...rest };
}

test('common rule needs no card-identity predicate and returns every eligible field card', () => {
  const result = resolveDoppelgangerContinuousOnce([
    card({ key: 'd1', name: 'ドッペルゲンガー', printedValue: 5 }),
    card({ key: 'x1', name: '別カード', printedValue: 5 }),
  ]);
  assert.equal(result.schema, 'gameroad.doppelganger-common-rule-resolution.v3');
  assert.deepEqual(Object.keys(result.deltas), ['d1', 'x1']);
  assert.equal(result.deltas.d1.penalty, 2);
  assert.equal(result.deltas.x1.penalty, 2);
});

test('same-number activates at two cards and includes each target physical card itself', () => {
  const result = resolveDoppelgangerContinuousOnce([
    card({ key: 'a', name: 'A', printedValue: 5 }),
    card({ key: 'b', name: 'B', printedValue: 5 }),
  ]);
  assert.equal(result.evaluationPasses, 1);
  for (const key of ['a', 'b']) {
    assert.equal(result.deltas[key].active, true);
    assert.equal(result.deltas[key].sameNumberCount, 2);
    assert.equal(result.deltas[key].sameNameOtherCount, 0);
    assert.equal(result.deltas[key].penalty, 2);
    assert.equal(result.deltas[key].delta, -2);
  }
});

test('same-number does not activate when printed values do not match', () => {
  const result = resolveDoppelgangerContinuousOnce([
    card({ key: 'a', name: 'A', printedValue: 5 }),
    card({ key: 'b', name: 'B', printedValue: 4 }),
  ]);
  assert.equal(result.deltas.a.active, false);
  assert.equal(result.deltas.a.penalty, 0);
  assert.equal(result.deltas.a.delta, 0);
  assert.equal(result.deltas.b.active, false);
  assert.equal(result.deltas.b.penalty, 0);
  assert.equal(result.deltas.b.delta, 0);
});

test('same-name extra debuff excludes the target itself', () => {
  const result = resolveDoppelgangerContinuousOnce([
    card({ key: 'd1', name: 'ドッペルゲンガー', printedValue: 5 }),
    card({ key: 'd2', name: 'ドッペルゲンガー', printedValue: 5 }),
    card({ key: 'x1', name: '別カード', printedValue: 5 }),
  ]);
  for (const key of ['d1', 'd2']) {
    assert.equal(result.deltas[key].sameNumberCount, 3);
    assert.equal(result.deltas[key].sameNameOtherCount, 1);
    assert.equal(result.deltas[key].penalty, 4);
  }
  assert.equal(result.deltas.x1.sameNumberCount, 3);
  assert.equal(result.deltas.x1.sameNameOtherCount, 0);
  assert.equal(result.deltas.x1.penalty, 3);
});

test('same-number census uses printed/base value and ignores current/debuffed value', () => {
  const result = resolveDoppelgangerContinuousOnce([
    card({ key: 'a', name: 'A', printedValue: 7, currentValue: 3 }),
    card({ key: 'b', name: 'B', printedValue: 7, currentValue: 1 }),
    card({ key: 'c', name: 'C', printedValue: 3, currentValue: 7 }),
  ]);
  assert.equal(result.deltas.a.sameNumberCount, 2);
  assert.equal(result.deltas.a.penalty, 2);
  assert.equal(result.deltas.b.sameNumberCount, 2);
  assert.equal(result.deltas.b.penalty, 2);
  assert.equal(result.deltas.c.sameNumberCount, 1);
  assert.equal(result.deltas.c.penalty, 0);
});

test('four-player field is censused once and never multiplied by player count', () => {
  const result = resolveDoppelgangerContinuousOnce([
    card({ key: 'p1', name: 'A', printedValue: 6 }),
    card({ key: 'p2', name: 'B', printedValue: 6 }),
    card({ key: 'p3', name: 'C', printedValue: 2 }),
    card({ key: 'p4', name: 'D', printedValue: 1 }),
  ]);
  assert.equal(result.evaluationPasses, 1);
  assert.equal(result.snapshotSize, 4);
  assert.equal(result.deltas.p1.penalty, 2);
  assert.equal(result.deltas.p2.penalty, 2);
  assert.equal(result.deltas.p3.penalty, 0);
  assert.equal(result.deltas.p4.penalty, 0);
  assert.notEqual(result.deltas.p1.penalty, 8);
});

test('duplicate projections of the same physical card are deduplicated before census', () => {
  const field = [
    card({ key: 'lane-view', instanceKey: 'physical-a', name: 'A', printedValue: 4 }),
    card({ key: 'participant-view', instanceKey: 'physical-a', name: 'A', printedValue: 4 }),
    card({ key: 'x1', name: 'X', printedValue: 4 }),
  ];
  assert.equal(normalizeDoppelgangerFieldSnapshot(field).length, 2);
  const result = resolveDoppelgangerContinuousOnce(field);
  assert.equal(result.snapshotSize, 2);
  assert.deepEqual(Object.keys(result.deltas), ['physical-a', 'x1']);
  assert.equal(result.deltas['physical-a'].sameNumberCount, 2);
  assert.equal(result.deltas['physical-a'].sameNameOtherCount, 0);
  assert.equal(result.deltas['physical-a'].penalty, 2);
  assert.equal(result.deltas.x1.penalty, 2);
});

test('recomputation from a changed snapshot replaces the prior result rather than accumulating it', () => {
  const before = resolveDoppelgangerContinuousOnce([
    card({ key: 'a', name: 'A', printedValue: 5 }),
    card({ key: 'b', name: 'B', printedValue: 5 }),
    card({ key: 'c', name: 'C', printedValue: 5 }),
  ]);
  const after = resolveDoppelgangerContinuousOnce([
    card({ key: 'a', name: 'A', printedValue: 5 }),
    card({ key: 'b', name: 'B', printedValue: 5 }),
  ]);
  assert.equal(before.deltas.a.penalty, 3);
  assert.equal(after.deltas.a.penalty, 2);
  assert.equal(after.deltas.a.delta, -2);
});

test('hand, deck and hidden cards stay out while Road remains an eligible field zone', () => {
  const result = resolveDoppelgangerContinuousOnce([
    card({ key: 'lane1', name: 'Lane', printedValue: 5 }),
    card({ key: 'hand1', name: 'Hand', printedValue: 5, zone: 'hand' }),
    card({ key: 'deck1', name: 'Deck', printedValue: 5, zone: 'deck' }),
    card({ key: 'hidden1', name: 'Hidden', printedValue: 5, hidden: true }),
    card({ key: 'road1', name: 'Road', printedValue: 5, zone: 'road' }),
  ]);
  assert.equal(result.snapshotSize, 2);
  assert.deepEqual(Object.keys(result.deltas), ['lane1', 'road1']);
  assert.equal(result.deltas.lane1.sameNumberCount, 2);
  assert.equal(result.deltas.road1.sameNumberCount, 2);
});

test('Battle-converted shield and ability-added Battle cards are field-eligible', () => {
  const result = resolveDoppelgangerContinuousOnce([
    card({ key: 'lane', name: 'Lane', printedValue: 3 }),
    card({ key: 'shield', name: 'Shield Battle', printedValue: 3, zone: 'auto_defense' }),
    card({ key: 'ability', name: 'Ability Battle', printedValue: 3, zone: 'ability_active_addition' }),
  ]);
  assert.equal(result.snapshotSize, 3);
  assert.deepEqual(Object.keys(result.deltas), ['lane', 'shield', 'ability']);
  for (const key of ['lane', 'shield', 'ability']) assert.equal(result.deltas[key].penalty, 3);
});

test('common rule does not infer card identity or special-case Super naming', () => {
  const result = resolveDoppelgangerContinuousOnce([
    card({ key: 'normal', name: 'ドッペルゲンガー', printedValue: 5 }),
    card({ key: 'super', name: '超ドッペルゲンガー', printedValue: 5 }),
    card({ key: 'x1', name: 'X', printedValue: 5 }),
  ]);
  assert.deepEqual(Object.keys(result.deltas), ['normal', 'super', 'x1']);
  assert.equal(result.deltas.normal.penalty, 3);
  assert.equal(result.deltas.super.penalty, 3);
  assert.equal(result.deltas.x1.penalty, 3);
});

test('core returns a delta only and does not invent below-zero clamping or generic modifier order', () => {
  const result = resolveDoppelgangerContinuousOnce([
    card({ key: 'a', name: 'Same', printedValue: 1 }),
    card({ key: 'b', name: 'Same', printedValue: 1 }),
    card({ key: 'c', name: 'Same', printedValue: 1 }),
  ]);
  assert.equal(result.deltas.a.sameNumberCount, 3);
  assert.equal(result.deltas.a.sameNameOtherCount, 2);
  assert.equal(result.deltas.a.penalty, 5);
  assert.equal(result.deltas.a.delta, -5);
  assert.equal('finalValue' in result.deltas.a, false);
});
