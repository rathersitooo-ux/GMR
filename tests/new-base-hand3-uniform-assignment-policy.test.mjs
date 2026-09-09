import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NEW_BASE_HAND3_UNIFORM_ASSIGNMENT_POLICY_SCHEMA,
  NEW_BASE_HAND3_UNIFORM_PERMUTATION_COUNT,
  createUniformHand3Assignment,
  drawUniformHand3PermutationIndex,
  resolveUniformHand3AssignmentFromPermutationIndex,
} from '../browser/new-base-hand3-uniform-assignment-policy.mjs';

const CARD_IDS = Object.freeze(['CARD_C', 'CARD_A', 'CARD_B']);
const HANDS = Object.freeze(['ROCK', 'SCISSORS', 'PAPER']);

test('all six permutation indexes cover all bijections exactly once and give every card each hand twice', () => {
  const seenMappings = new Set();
  const counts = new Map();

  for (let permutationIndex = 0; permutationIndex < NEW_BASE_HAND3_UNIFORM_PERMUTATION_COUNT; permutationIndex += 1) {
    const result = resolveUniformHand3AssignmentFromPermutationIndex({
      assignmentEpochId: 'turn:12',
      handCardIds: CARD_IDS,
      permutationIndex,
    });
    assert.equal(result.schema, NEW_BASE_HAND3_UNIFORM_ASSIGNMENT_POLICY_SCHEMA);
    assert.deepEqual(result.canonicalCardIds, ['CARD_A', 'CARD_B', 'CARD_C']);
    const mappingKey = HANDS.map((hand) => result.assignedCardIdsByJankenHand[hand]).join('|');
    seenMappings.add(mappingKey);

    for (const hand of HANDS) {
      const cardId = result.assignedCardIdsByJankenHand[hand];
      const key = `${cardId}:${hand}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  assert.equal(seenMappings.size, 6);
  for (const cardId of ['CARD_A', 'CARD_B', 'CARD_C']) {
    for (const hand of HANDS) {
      assert.equal(counts.get(`${cardId}:${hand}`), 2,
        'six equiprobable permutations give each physical card a 1/3 marginal chance per fixed hand');
    }
  }
});

test('the same physical cards and permutation index ignore incoming hand/UI order', () => {
  const first = resolveUniformHand3AssignmentFromPermutationIndex({
    assignmentEpochId: 'turn:stable',
    handCardIds: ['CARD_A', 'CARD_B', 'CARD_C'],
    permutationIndex: 4,
  });
  const reordered = resolveUniformHand3AssignmentFromPermutationIndex({
    assignmentEpochId: 'turn:stable',
    handCardIds: ['CARD_C', 'CARD_A', 'CARD_B'],
    permutationIndex: 4,
  });

  assert.deepEqual(reordered.assignedCardIdsByJankenHand, first.assignedCardIdsByJankenHand);
  assert.deepEqual(reordered.canonicalCardIds, first.canonicalCardIds);
});

test('uint32 rejection sampling removes modulo bias and never uses Math.random', () => {
  const supplied = [0xffff_ffff, 0xffff_fffe, 5];
  let calls = 0;
  const index = drawUniformHand3PermutationIndex(() => {
    calls += 1;
    return supplied.shift();
  });

  assert.equal(index, 5);
  assert.equal(calls, 3);
});

test('createUniformHand3Assignment draws one accepted authoritative index and returns a frozen mapping', () => {
  let calls = 0;
  const result = createUniformHand3Assignment({
    assignmentEpochId: 'turn:27',
    handCardIds: ['PHYS_3', 'PHYS_1', 'PHYS_2'],
    readUint32() {
      calls += 1;
      return 8;
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.permutationIndex, 2);
  assert.deepEqual(result.assignedCardIdsByJankenHand, {
    ROCK: 'PHYS_2',
    SCISSORS: 'PHYS_1',
    PAPER: 'PHYS_3',
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.assignedCardIdsByJankenHand), true);
});

test('policy rejects non-three-card hands, duplicates, bad indexes, and invalid entropy', () => {
  assert.throws(
    () => resolveUniformHand3AssignmentFromPermutationIndex({
      assignmentEpochId: 'turn:x',
      handCardIds: ['A', 'B'],
      permutationIndex: 0,
    }),
    /exactly 3 physical card ids/,
  );
  assert.throws(
    () => resolveUniformHand3AssignmentFromPermutationIndex({
      assignmentEpochId: 'turn:x',
      handCardIds: ['A', 'A', 'B'],
      permutationIndex: 0,
    }),
    /3 distinct physical card ids/,
  );
  assert.throws(
    () => resolveUniformHand3AssignmentFromPermutationIndex({
      assignmentEpochId: 'turn:x',
      handCardIds: ['A', 'B', 'C'],
      permutationIndex: 6,
    }),
    /integer in \[0, 5\]/,
  );
  assert.throws(
    () => drawUniformHand3PermutationIndex(() => -1),
    /integer in \[0, 4294967295\]/,
  );
});
