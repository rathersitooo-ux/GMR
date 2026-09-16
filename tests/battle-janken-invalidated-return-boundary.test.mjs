import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_JANKEN_INVALIDATED_RETURN_SCHEMA,
  createBattleJankenInvalidatedReturnBoundary,
  projectBattleJankenInvalidatedReturn,
} from '../browser/battle-janken-invalidated-return-boundary.mjs';

function readyContext(overrides = {}) {
  return {
    resolverResult: {
      processingOrder: ['p1', 'p2', 'p3', 'p4'],
      invalidated: ['p2'],
    },
    selection: { playerId: 'p2', cardId: 'physical-card-22' },
    handCardIds: ['hand-a', 'hand-b'],
    returnedCardIds: [],
    ...overrides,
  };
}

test('projection permits only the exact same physical card of an authoritatively invalidated player', () => {
  const result = projectBattleJankenInvalidatedReturn({
    ...readyContext(),
    request: { playerId: 'p2', cardId: 'physical-card-22' },
  });

  assert.equal(result.schema, BATTLE_JANKEN_INVALIDATED_RETURN_SCHEMA);
  assert.equal(result.ok, true);
  assert.equal(result.eligible, true);
  assert.equal(result.returned, false);
  assert.equal(result.playerId, 'p2');
  assert.equal(result.cardId, 'physical-card-22');
  assert.equal(result.action, 'RETURN_SAME_PHYSICAL_CARD_TO_HAND');
  assert.equal(result.samePhysicalCard, true);
  assert.equal(result.movementRollback, false);
  assert.equal(result.resolverWrite, false);
  assert.equal(result.turnOrderWrite, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.invalidatedPlayerIds), true);
});

test('projection fails closed when resolver did not invalidate the exact player', () => {
  const result = projectBattleJankenInvalidatedReturn({
    ...readyContext({ resolverResult: { invalidated: ['p3'] } }),
    request: { playerId: 'p2', cardId: 'physical-card-22' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'PLAYER_NOT_INVALIDATED');
  assert.equal(result.returned, false);
});

test('projection rejects mismatched player/card lineage and malformed resolver evidence', () => {
  const wrongCard = projectBattleJankenInvalidatedReturn({
    ...readyContext(),
    request: { playerId: 'p2', cardId: 'different-physical-card' },
  });
  assert.equal(wrongCard.reason, 'SELECTION_LINEAGE_MISMATCH');

  const wrongPlayer = projectBattleJankenInvalidatedReturn({
    ...readyContext(),
    request: { playerId: 'p3', cardId: 'physical-card-22' },
  });
  assert.equal(wrongPlayer.reason, 'SELECTION_LINEAGE_MISMATCH');

  const malformed = projectBattleJankenInvalidatedReturn({
    ...readyContext({ resolverResult: { invalidated: ['p2', 'p2'] } }),
    request: { playerId: 'p2', cardId: 'physical-card-22' },
  });
  assert.equal(malformed.reason, 'INVALID_RESOLVER_RESULT');
});

test('projection never duplicates a card already in hand or already returned', () => {
  const inHand = projectBattleJankenInvalidatedReturn({
    ...readyContext({ handCardIds: ['hand-a', 'physical-card-22'] }),
    request: { playerId: 'p2', cardId: 'physical-card-22' },
  });
  assert.equal(inHand.reason, 'CARD_ALREADY_IN_HAND');

  const priorReturn = projectBattleJankenInvalidatedReturn({
    ...readyContext({ returnedCardIds: ['physical-card-22'] }),
    request: { playerId: 'p2', cardId: 'physical-card-22' },
  });
  assert.equal(priorReturn.reason, 'CARD_ALREADY_RETURNED');
});

test('executor delegates the exact identity to existing hand authority once', async () => {
  const delegated = [];
  const boundary = createBattleJankenInvalidatedReturnBoundary({
    readContext: async () => readyContext(),
    returnCardToHand: async (payload) => {
      delegated.push(payload);
      return true;
    },
  });

  const request = { playerId: 'p2', cardId: 'physical-card-22' };
  const first = await boundary.returnInvalidated(request);
  assert.equal(first.ok, true);
  assert.equal(first.returned, true);
  assert.equal(first.reason, 'RETURNED_BY_EXISTING_HAND_AUTHORITY');
  assert.equal(first.movementRollback, false);
  assert.equal(delegated.length, 1);
  assert.deepEqual(delegated[0], {
    schema: BATTLE_JANKEN_INVALIDATED_RETURN_SCHEMA,
    playerId: 'p2',
    cardId: 'physical-card-22',
    reason: 'JANKEN_INVALIDATED',
    samePhysicalCard: true,
    movementRollback: false,
  });
  assert.equal(Object.isFrozen(delegated[0]), true);

  const second = await boundary.returnInvalidated(request);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'BOUNDARY_ALREADY_RETURNED');
  assert.equal(delegated.length, 1);
});

test('executor blocks concurrent duplicate return while the first exact card is in flight', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let delegateCalls = 0;
  const boundary = createBattleJankenInvalidatedReturnBoundary({
    readContext: async () => readyContext(),
    returnCardToHand: async () => {
      delegateCalls += 1;
      await gate;
      return true;
    },
  });

  const request = { playerId: 'p2', cardId: 'physical-card-22' };
  const firstPromise = boundary.returnInvalidated(request);
  await Promise.resolve();
  const second = await boundary.returnInvalidated(request);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'RETURN_IN_FLIGHT');

  release();
  const first = await firstPromise;
  assert.equal(first.ok, true);
  assert.equal(delegateCalls, 1);
});

test('authority read errors and hand-authority rejection fail closed without manufacturing a return', async () => {
  const readFailure = createBattleJankenInvalidatedReturnBoundary({
    readContext: async () => { throw new Error('authority unavailable'); },
    returnCardToHand: async () => true,
  });
  const readResult = await readFailure.returnInvalidated({
    playerId: 'p2',
    cardId: 'physical-card-22',
  });
  assert.equal(readResult.reason, 'AUTHORITY_READ_ERROR');
  assert.equal(readResult.returned, false);

  let calls = 0;
  const rejected = createBattleJankenInvalidatedReturnBoundary({
    readContext: async () => readyContext(),
    returnCardToHand: async () => {
      calls += 1;
      return false;
    },
  });
  const rejectedResult = await rejected.returnInvalidated({
    playerId: 'p2',
    cardId: 'physical-card-22',
  });
  assert.equal(rejectedResult.reason, 'RETURN_AUTHORITY_REJECTED');
  assert.equal(rejectedResult.returned, false);
  assert.equal(calls, 1);
});
