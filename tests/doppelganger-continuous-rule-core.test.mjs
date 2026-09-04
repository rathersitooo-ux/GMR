import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeDoppelgangerFieldSnapshot,
  resolveDoppelgangerContinuousOnce,
} from '../browser/doppelganger-continuous-rule-core.mjs';

function card({
  key,
  name,
  printedValue,
  zone = 'lane',
  doppel = false,
  currentValue = printedValue,
  instanceKey,
  ...rest
}) {
  return {
    key,
    instanceKey,
    name,
    printedValue,
    currentValue,
    zone,
    isNormalDoppelganger: doppel,
    ...rest,
  };
}

const isNormalDoppelganger = entry => entry.source.isNormalDoppelganger === true;

test('same-number activates at two cards and includes Doppelganger itself', () => {
  const result = resolveDoppelgangerContinuousOnce([
    card({ key: 'd1', name: 'ドッペルゲンガー', printedValue: 5, doppel: true }),
    card({ key: 'x1', name: '別カード', printedValue: 5 }),
  ], { isNormalDoppelganger });

  assert.equal(result.evaluationPasses, 1);
  assert.equal(result.deltas.d1.active, true);
  assert.equal(result.deltas.d1.sameNumberCount, 2);
  assert.equal(result.deltas.d1.sameNameOtherCount, 0);
  assert.equal(result.deltas.d1.penalty, 2);
  assert.equal(result.deltas.d1.delta, -2);
});

test('same-number does not activate when Doppelganger is the only printed-number match', () => {
  const result = resolveDoppelgangerContinuousOnce([
    card({ key: 'd1', name: 'ドッペルゲンガー', printedValue: 5, doppel: true }),
    card({ key: 'x1', name: '別カード', printedValue: 4 }),
  ], { isNormalDoppelganger });

  assert.equal(result.deltas.d1.active, false);
  assert.equal(result.deltas.d1.penalty, 0);
  assert.equal(result.deltas.d1.delta, 0);
});

test('same-name extra debuff excludes the target itself', () => {
  const result = resolveDoppelgangerContinuousOnce([
    card({ key: 'd1', name: 'ドッペルゲンガー', printedValue: 5, doppel: true }),
    card({ key: 'd2', name: 'ドッペルゲンガー', printedValue: 5, doppel: true }),
    card({ key: 'x1', name: '別カード', printedValue: 5 }),
  ], { isNormalDoppelganger });

  assert.equal(result.deltas.d1.sameNumberCount, 3);
  assert.equal(result.deltas.d1.sameNameOtherCount, 1);
  assert.equal(result.deltas.d1.penalty, 4);
  assert.equal(result.deltas.d2.penalty, 4);
});

test('same-number census uses printed/base value and ignores current/debuffed value', () => {
  const result = resolveDoppelgangerContinuousOnce([
    card({
      key: 'd1',
      name: 'ドッペルゲンガー',
      printedValue: 7,
      currentValue: 3,
      doppel: true,
    }),
    card({ key: 'x1', name: '別カードA', printedValue: 7, currentValue: 1 }),
    card({ key: 'x2', name: '別カードB', printedValue: 3, currentValue: 7 }),
  ], { isNormalDoppelganger });

  assert.equal(result.deltas.d1.sameNumberCount, 2);
  assert.equal(result.deltas.d1.penalty, 2);
});

test('four-player field is censused once and never multiplied by player count', () => {
  const field = [
    card({ key: 'p1-d', name: 'ドッペルゲンガー', printedValue: 6, doppel: true }),
    card({ key: 'p2-a', name: 'A', printedValue: 6 }),
    card({ key: 'p3-b', name: 'B', printedValue: 2 }),
    card({ key: 'p4-c', name: 'C', printedValue: 1 }),
  ];

  const result = resolveDoppelgangerContinuousOnce(field, { isNormalDoppelganger });

  assert.equal(result.evaluationPasses, 1);
  assert.equal(result.snapshotSize, 4);
  assert.equal(result.deltas['p1-d'].sameNumberCount, 2);
  assert.equal(result.deltas['p1-d'].penalty, 2);
  assert.notEqual(result.deltas['p1-d'].penalty, 8);
});

test('duplicate projections of the same physical card are deduplicated before census', () => {
  const field = [
    card({
      key: 'lane-view',
      instanceKey: 'physical-d1',
      name: 'ドッペルゲンガー',
      printedValue: 4,
      doppel: true,
    }),
    card({
      key: 'participant-view',
      instanceKey: 'physical-d1',
      name: 'ドッペルゲンガー',
      printedValue: 4,
      doppel: true,
    }),
    card({ key: 'x1', name: 'X', printedValue: 4 }),
  ];

  const normalized = normalizeDoppelgangerFieldSnapshot(field);
  assert.equal(normalized.length, 2);

  const result = resolveDoppelgangerContinuousOnce(field, { isNormalDoppelganger });
  assert.equal(result.snapshotSize, 2);
  assert.equal(result.deltas['physical-d1'].sameNumberCount, 2);
  assert.equal(result.deltas['physical-d1'].sameNameOtherCount, 0);
  assert.equal(result.deltas['physical-d1'].penalty, 2);
});

test('recomputation from a changed snapshot replaces the prior result rather than accumulating it', () => {
  const before = resolveDoppelgangerContinuousOnce([
    card({ key: 'd1', name: 'ドッペルゲンガー', printedValue: 5, doppel: true }),
    card({ key: 'x1', name: 'X', printedValue: 5 }),
    card({ key: 'x2', name: 'Y', printedValue: 5 }),
  ], { isNormalDoppelganger });

  const after = resolveDoppelgangerContinuousOnce([
    card({ key: 'd1', name: 'ドッペルゲンガー', printedValue: 5, doppel: true }),
    card({ key: 'x1', name: 'X', printedValue: 5 }),
  ], { isNormalDoppelganger });

  assert.equal(before.deltas.d1.penalty, 3);
  assert.equal(after.deltas.d1.penalty, 2);
  assert.equal(after.deltas.d1.delta, -2);
});

test('hand, deck, hidden cards and non-field cards never enter the census', () => {
  const result = resolveDoppelgangerContinuousOnce([
    card({ key: 'd1', name: 'ドッペルゲンガー', printedValue: 5, doppel: true }),
    card({ key: 'hand1', name: 'Hand', printedValue: 5, zone: 'hand' }),
    card({ key: 'deck1', name: 'Deck', printedValue: 5, zone: 'deck' }),
    card({ key: 'hidden1', name: 'Hidden', printedValue: 5, hidden: true }),
    card({ key: 'road1', name: 'Road', printedValue: 5, zone: 'road' }),
  ], { isNormalDoppelganger });

  assert.equal(result.snapshotSize, 2);
  assert.equal(result.deltas.d1.sameNumberCount, 2);
});

test('Battle-converted shield and ability-added Battle cards are field-eligible', () => {
  const result = resolveDoppelgangerContinuousOnce([
    card({ key: 'd1', name: 'ドッペルゲンガー', printedValue: 3, doppel: true }),
    card({ key: 'shield', name: 'Shield Battle', printedValue: 3, zone: 'auto_defense' }),
    card({ key: 'ability', name: 'Ability Battle', printedValue: 3, zone: 'ability_active_addition' }),
  ], { isNormalDoppelganger });

  assert.equal(result.snapshotSize, 3);
  assert.equal(result.deltas.d1.sameNumberCount, 3);
  assert.equal(result.deltas.d1.penalty, 3);
});

test('non-Doppel cards receive no delta and Super/超 is not implicitly matched', () => {
  const result = resolveDoppelgangerContinuousOnce([
    card({ key: 'normal', name: 'ドッペルゲンガー', printedValue: 5, doppel: true }),
    card({ key: 'super', name: '超ドッペルゲンガー', printedValue: 5, doppel: false }),
    card({ key: 'x1', name: 'X', printedValue: 5 }),
  ], { isNormalDoppelganger });

  assert.deepEqual(Object.keys(result.deltas), ['normal']);
});

test('core returns a delta only and does not invent below-zero clamping or generic modifier order', () => {
  const result = resolveDoppelgangerContinuousOnce([
    card({ key: 'd1', name: 'ドッペルゲンガー', printedValue: 1, doppel: true }),
    card({ key: 'd2', name: 'ドッペルゲンガー', printedValue: 1, doppel: true }),
    card({ key: 'd3', name: 'ドッペルゲンガー', printedValue: 1, doppel: true }),
  ], { isNormalDoppelganger });

  assert.equal(result.deltas.d1.sameNumberCount, 3);
  assert.equal(result.deltas.d1.sameNameOtherCount, 2);
  assert.equal(result.deltas.d1.penalty, 5);
  assert.equal(result.deltas.d1.delta, -5);
  assert.equal('finalValue' in result.deltas.d1, false);
});
