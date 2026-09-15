import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_JANKEN_INVALIDATED_RETURN_CONTRACT,
  projectInvalidatedJankenReturnToHand,
} from '../browser/battle-janken-invalidated-return-boundary.mjs';

test('returns only resolver-invalidated reservations to the same player hand', () => {
  const result = projectInvalidatedJankenReturnToHand({
    resolverResult: { invalidated: ['P2', 'P4'] },
    reservations: [
      { playerId: 'P1', physicalCardId: 'p1-card-7' },
      { playerId: 'P2', physicalCardId: 'p2-card-2' },
      { playerId: 'P3', physicalCardId: 'p3-card-4' },
      { playerId: 'P4', physicalCardId: 'p4-card-9' },
    ],
    hands: [
      { playerId: 'P1', physicalCardIds: ['p1-a'] },
      { playerId: 'P2', physicalCardIds: ['p2-a'] },
      { playerId: 'P3', physicalCardIds: [] },
      { playerId: 'P4', physicalCardIds: ['p4-a', 'p4-b'] },
    ],
  });

  assert.deepEqual(result.returns, [
    { playerId: 'P2', physicalCardId: 'p2-card-2', fromZone: 'JANKEN_RESERVED', toZone: 'HAND', reason: 'INVALIDATED_COMPARISON_RESOLVED' },
    { playerId: 'P4', physicalCardId: 'p4-card-9', fromZone: 'JANKEN_RESERVED', toZone: 'HAND', reason: 'INVALIDATED_COMPARISON_RESOLVED' },
  ]);
  assert.deepEqual(result.nextHands, [
    { playerId: 'P1', physicalCardIds: ['p1-a'] },
    { playerId: 'P2', physicalCardIds: ['p2-a', 'p2-card-2'] },
    { playerId: 'P3', physicalCardIds: [] },
    { playerId: 'P4', physicalCardIds: ['p4-a', 'p4-b', 'p4-card-9'] },
  ]);
  assert.equal(result.movementRollback, false);
  assert.equal(result.resolverOwnedHere, false);
  assert.equal(result.gameStateWrite, false);
});

test('no invalidated cards is a no-op projection', () => {
  const hands = [{ playerId: 'P1', physicalCardIds: ['p1-a'] }];
  const result = projectInvalidatedJankenReturnToHand({
    resolverResult: { invalidated: [] },
    reservations: [{ playerId: 'P1', physicalCardId: 'p1-r' }],
    hands,
  });
  assert.deepEqual(result.returns, []);
  assert.deepEqual(result.nextHands, hands);
});

test('fails closed when invalidated player physical-card lineage is missing', () => {
  assert.throws(() => projectInvalidatedJankenReturnToHand({
    resolverResult: { invalidated: ['P2'] },
    reservations: [{ playerId: 'P1', physicalCardId: 'p1-r' }],
    hands: [{ playerId: 'P2', physicalCardIds: [] }],
  }), /INVALIDATED_PLAYER_RESERVATION_REQUIRED/);
});

test('fails closed instead of duplicating a reserved physical card already in hand', () => {
  assert.throws(() => projectInvalidatedJankenReturnToHand({
    resolverResult: { invalidated: ['P2'] },
    reservations: [{ playerId: 'P2', physicalCardId: 'p2-r' }],
    hands: [{ playerId: 'P2', physicalCardIds: ['p2-r'] }],
  }), /RESERVED_PHYSICAL_CARD_ALREADY_IN_HAND/);
});

test('rejects duplicate physical-card reservation ownership', () => {
  assert.throws(() => projectInvalidatedJankenReturnToHand({
    resolverResult: { invalidated: [] },
    reservations: [
      { playerId: 'P1', physicalCardId: 'same-card' },
      { playerId: 'P2', physicalCardId: 'same-card' },
    ],
    hands: [],
  }), /DUPLICATE_RESERVED_PHYSICAL_CARD_ID/);
});

test('contract keeps comparison state transient and never owns movement rollback', () => {
  assert.equal(BATTLE_JANKEN_INVALIDATED_RETURN_CONTRACT.invalidatedState, 'TRANSIENT_COMPARISON_RESULT_ONLY');
  assert.equal(BATTLE_JANKEN_INVALIDATED_RETURN_CONTRACT.defaultDisposition, 'RETURN_SAME_PHYSICAL_CARD_TO_HAND_AFTER_COMPARISON');
  assert.equal(BATTLE_JANKEN_INVALIDATED_RETURN_CONTRACT.movementRollback, false);
  assert.equal(BATTLE_JANKEN_INVALIDATED_RETURN_CONTRACT.gameStateWrite, false);
});
