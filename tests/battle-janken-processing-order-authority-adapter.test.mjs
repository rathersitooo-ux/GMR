import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_JANKEN_PROCESSING_ORDER_AUTHORITY_CONTRACT,
  BATTLE_JANKEN_PROCESSING_ORDER_AUTHORITY_SCHEMA,
  buildBattleJankenProcessingOrderAuthoritySnapshot,
} from '../browser/battle-janken-processing-order-authority-adapter.mjs';

function acceptedPublicCards() {
  return [
    { playerId: 'p1', cardId: 'card-30', displayNumber: 30, hand: 'ROCK' },
    { playerId: 'p2', cardId: 'card-10', displayNumber: 10, hand: 'SCISSORS' },
    { playerId: 'p3', cardId: 'card-40', displayNumber: 40, hand: 'PAPER' },
    { playerId: 'p4', cardId: 'card-20', displayNumber: 20, hand: 'ROCK' },
  ];
}

test('builds atomic publicCards + resolution using printed-number ascending order', () => {
  const source = acceptedPublicCards();
  const sourceBefore = structuredClone(source);
  const result = buildBattleJankenProcessingOrderAuthoritySnapshot({ publicCards: source });

  assert.equal(result.schema, BATTLE_JANKEN_PROCESSING_ORDER_AUTHORITY_SCHEMA);
  assert.equal(result.status, 'RESOLVED');
  assert.equal(result.reason, 'PRINTED_NUMBER_ORDER_RESOLVED');
  assert.deepEqual(result.processingOrder, ['p2', 'p4', 'p1', 'p3']);
  assert.deepEqual(result.resolution.processingOrder, ['p2', 'p4', 'p1', 'p3']);
  assert.deepEqual(result.resolution.resolvedWinners, ['p2']);
  assert.deepEqual(result.resolution.unresolvedSurvivors, ['p4', 'p1']);
  assert.deepEqual(result.resolution.invalidated, ['p3']);
  assert.deepEqual(
    result.resolution.steps.map((step) => step.processedPlayerId),
    ['p2', 'p4', 'p1'],
  );

  assert.deepEqual(result.publicCards.map((card) => card.playerId), ['p1', 'p2', 'p3', 'p4']);
  assert.deepEqual(result.publicCards.map((card) => card.displayNumber), [30, 10, 40, 20]);
  assert.deepEqual(source, sourceBefore);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.publicCards), true);
  assert.equal(Object.isFrozen(result.resolution), true);
  assert.equal(result.gameStateWrite, false);
});

test('accepts an authoritative printedNumber field and projects it as the public display number', () => {
  const publicCards = acceptedPublicCards().map(({ displayNumber, ...card }) => ({
    ...card,
    printedNumber: displayNumber,
  }));
  const result = buildBattleJankenProcessingOrderAuthoritySnapshot({ publicCards });

  assert.equal(result.status, 'RESOLVED');
  assert.deepEqual(result.publicCards.map((card) => card.displayNumber), [30, 10, 40, 20]);
  assert.deepEqual(result.processingOrder, ['p2', 'p4', 'p1', 'p3']);
});

test('equal printed numbers fail closed without a persisted random tie-draw receipt', () => {
  const publicCards = acceptedPublicCards();
  publicCards[0].displayNumber = 10;
  const result = buildBattleJankenProcessingOrderAuthoritySnapshot({ publicCards });

  assert.equal(result.status, 'UNRESOLVED_EQUAL_PRINTED_NUMBER');
  assert.equal(result.reason, 'EQUAL_PRINTED_NUMBER_PROCESSING_ORDER_UNRESOLVED');
  assert.equal(result.processingOrder, null);
  assert.equal(result.resolution, null);
  assert.deepEqual(result.tiedPrintedNumbers, [10]);
  assert.equal(result.equalPrintedNumberTieBreak, false);
  assert.deepEqual(result.publicCards.map((card) => card.playerId), ['p1', 'p2', 'p3', 'p4']);
});


test('same-number tie resolves using the exact persisted random draw and replays unchanged', () => {
  const publicCards = acceptedPublicCards();
  publicCards[0].displayNumber = 10;
  const persistedEqualNumberOrder = {
    decisionId: 'battle-001-tie-draw',
    orderedTiedPlayerIds: ['p2', 'p1'],
  };
  const before = structuredClone(persistedEqualNumberOrder);
  const first = buildBattleJankenProcessingOrderAuthoritySnapshot({
    publicCards, persistedEqualNumberOrder,
  });
  const second = buildBattleJankenProcessingOrderAuthoritySnapshot({
    publicCards, persistedEqualNumberOrder,
  });

  assert.equal(first.status, 'RESOLVED');
  assert.equal(first.reason, 'PRINTED_NUMBER_ORDER_WITH_PERSISTED_RANDOM_TIES_RESOLVED');
  assert.deepEqual(first.tiedPrintedNumbers, [10]);
  assert.deepEqual(first.processingOrder, ['p2', 'p1', 'p4', 'p3']);
  assert.deepEqual(second.processingOrder, first.processingOrder);
  assert.deepEqual(second.resolution, first.resolution);
  assert.deepEqual(first.persistedEqualNumberOrder, before);
  assert.deepEqual(persistedEqualNumberOrder, before);
  assert.equal(Object.isFrozen(first.persistedEqualNumberOrder), true);
  assert.equal(first.equalPrintedNumberTieBreak, true);
  assert.equal(first.gameStateWrite, false);

  const reversed = buildBattleJankenProcessingOrderAuthoritySnapshot({
    publicCards,
    persistedEqualNumberOrder: {
      decisionId: 'battle-001-other-draw',
      orderedTiedPlayerIds: ['p1', 'p2'],
    },
  });
  assert.deepEqual(reversed.processingOrder, ['p1', 'p2', 'p4', 'p3']);
  assert.notDeepEqual(first.resolution.resolvedWinners, reversed.resolution.resolvedWinners);
});

test('multiple equal-number groups permit separate permutations, never different-number swaps', () => {
  const publicCards = acceptedPublicCards();
  publicCards[0].displayNumber = 20;
  publicCards[1].displayNumber = 10;
  publicCards[2].displayNumber = 20;
  publicCards[3].displayNumber = 10;
  const result = buildBattleJankenProcessingOrderAuthoritySnapshot({
    publicCards,
    persistedEqualNumberOrder: {
      decisionId: 'battle-002-tie-draw',
      orderedTiedPlayerIds: ['p4', 'p2', 'p3', 'p1'],
    },
  });
  assert.deepEqual(result.tiedPrintedNumbers, [10, 20]);
  assert.deepEqual(result.processingOrder, ['p4', 'p2', 'p3', 'p1']);

  for (const orderedTiedPlayerIds of [
    ['p1', 'p2', 'p3', 'p4'], // distinct-rank priority broken
    ['p2', 'p2', 'p3', 'p1'], // duplicate player
    ['p4', 'p2', 'p3'], // incomplete
    ['p4', 'p2', 'p3', 'intruder'], // unknown player
  ]) {
    assert.throws(() => buildBattleJankenProcessingOrderAuthoritySnapshot({
      publicCards,
      persistedEqualNumberOrder: {
        decisionId: 'battle-002-tie-draw',
        orderedTiedPlayerIds,
      },
    }), /persisted equal-number order/);
  }
});

test('rejects malformed/stale tie receipts and leaves no ties on strict number priority', () => {
  const tied = acceptedPublicCards();
  tied[0].displayNumber = 10;
  for (const receipt of [
    {},
    { decisionId: 'tie-1', orderedTiedPlayerIds: ['p1'] },
    { decisionId: '', orderedTiedPlayerIds: ['p1', 'p2'] },
    { decisionId: ' tie-1 ', orderedTiedPlayerIds: ['p1', 'p2'] },
    { decisionId: 'tie-1', orderedTiedPlayerIds: ['p1', 'p3'] },
  ]) {
    assert.throws(() => buildBattleJankenProcessingOrderAuthoritySnapshot({
      publicCards: tied, persistedEqualNumberOrder: receipt,
    }));
  }
  assert.throws(() => buildBattleJankenProcessingOrderAuthoritySnapshot({
    publicCards: acceptedPublicCards(),
    persistedEqualNumberOrder: {
      decisionId: 'stale-other-battle',
      orderedTiedPlayerIds: ['p1', 'p2'],
    },
  }), /without tied cards/);
});

test('malformed public cards fail closed before any ordering or comparison', () => {
  assert.throws(
    () => buildBattleJankenProcessingOrderAuthoritySnapshot({ publicCards: acceptedPublicCards().slice(0, 3) }),
    /exactly four/,
  );

  const duplicatePlayer = acceptedPublicCards();
  duplicatePlayer[3].playerId = 'p1';
  assert.throws(
    () => buildBattleJankenProcessingOrderAuthoritySnapshot({ publicCards: duplicatePlayer }),
    /duplicate public card playerId/,
  );

  const duplicateCard = acceptedPublicCards();
  duplicateCard[3].cardId = 'card-30';
  assert.throws(
    () => buildBattleJankenProcessingOrderAuthoritySnapshot({ publicCards: duplicateCard }),
    /duplicate public card cardId/,
  );

  const stringNumber = acceptedPublicCards();
  stringNumber[1].displayNumber = '10';
  assert.throws(
    () => buildBattleJankenProcessingOrderAuthoritySnapshot({ publicCards: stringNumber }),
    /safe integer/,
  );

  const nonInteger = acceptedPublicCards();
  nonInteger[1].displayNumber = 10.5;
  assert.throws(
    () => buildBattleJankenProcessingOrderAuthoritySnapshot({ publicCards: nonInteger }),
    /safe integer/,
  );

  const unsupportedHand = acceptedPublicCards();
  unsupportedHand[1].hand = 'チョキ';
  assert.throws(
    () => buildBattleJankenProcessingOrderAuthoritySnapshot({ publicCards: unsupportedHand }),
    /ROCK, SCISSORS, or PAPER/,
  );

  const mismatchedNumbers = acceptedPublicCards();
  mismatchedNumbers[1].printedNumber = 9;
  assert.throws(
    () => buildBattleJankenProcessingOrderAuthoritySnapshot({ publicCards: mismatchedNumbers }),
    /printedNumber and displayNumber must match/,
  );
});

test('contract owns only documented number-order and existing triad resolution authority', () => {
  assert.deepEqual(BATTLE_JANKEN_PROCESSING_ORDER_AUTHORITY_CONTRACT.acceptedHands, [
    'ROCK', 'SCISSORS', 'PAPER',
  ]);
  assert.equal(BATTLE_JANKEN_PROCESSING_ORDER_AUTHORITY_CONTRACT.processingOrderAuthority, true);
  assert.equal(
    BATTLE_JANKEN_PROCESSING_ORDER_AUTHORITY_CONTRACT.processingOrderRule,
    'PRINTED_NUMBER_ASCENDING',
  );
  assert.equal(
    BATTLE_JANKEN_PROCESSING_ORDER_AUTHORITY_CONTRACT.equalPrintedNumberPolicy,
    'EXACT_CALLER_PERSISTED_RANDOM_TIE_ORDER',
  );
  assert.equal(
    BATTLE_JANKEN_PROCESSING_ORDER_AUTHORITY_CONTRACT.jankenResolutionAuthority,
    'EXISTING_TRIAD_FIRST_WIN_LOCK_RESOLVER',
  );
  assert.equal(BATTLE_JANKEN_PROCESSING_ORDER_AUTHORITY_CONTRACT.persistedDrawRequiredForTies, true);
  assert.equal(BATTLE_JANKEN_PROCESSING_ORDER_AUTHORITY_CONTRACT.randomDrawingOwnedHere, false);
  assert.equal(BATTLE_JANKEN_PROCESSING_ORDER_AUTHORITY_CONTRACT.persistenceOwnedHere, false);
  assert.equal(BATTLE_JANKEN_PROCESSING_ORDER_AUTHORITY_CONTRACT.mutatesAcceptedPublicCardOrder, false);
  assert.equal(BATTLE_JANKEN_PROCESSING_ORDER_AUTHORITY_CONTRACT.targetAuthority, false);
  assert.equal(BATTLE_JANKEN_PROCESSING_ORDER_AUTHORITY_CONTRACT.shieldAuthority, false);
  assert.equal(BATTLE_JANKEN_PROCESSING_ORDER_AUTHORITY_CONTRACT.destinationAuthority, false);
  assert.equal(BATTLE_JANKEN_PROCESSING_ORDER_AUTHORITY_CONTRACT.transportAuthority, false);
  assert.equal(BATTLE_JANKEN_PROCESSING_ORDER_AUTHORITY_CONTRACT.gameStateWrite, false);
  assert.equal(BATTLE_JANKEN_PROCESSING_ORDER_AUTHORITY_CONTRACT.presentationAuthority, false);
});
