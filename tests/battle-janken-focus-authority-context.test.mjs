import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_JANKEN_FOCUS_AUTHORITY_CONTEXT_CONTRACT,
  BATTLE_JANKEN_FOCUS_AUTHORITY_CONTEXT_SCHEMA,
  createBattleJankenFocusAuthorityContextReader,
} from '../browser/battle-janken-focus-authority-context.mjs';
import {
  createRoundStartJankenSlotAssignment,
  NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE,
} from '../browser/new-base-round-start-janken-slot-assignment-core.mjs';

function currentSnapshot(roundId = 'battle-round:9', mapping = {}) {
  const hand = [
    { id: 'card-a', suit: 'SP' },
    { id: 'card-b', suit: 'CL' },
    { id: 'card-c', suit: 'DI' },
  ];
  return createRoundStartJankenSlotAssignment({
    roundId,
    hand,
    assignmentMode: NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE.CURRENT_HAND3_POLICY,
    assignedCardIdsByJankenHand: {
      ROCK: mapping.ROCK ?? 'card-c',
      SCISSORS: mapping.SCISSORS ?? 'card-a',
      PAPER: mapping.PAPER ?? 'card-b',
    },
  });
}

function candidate({ roundId, jankenHand, cardId }) {
  return {
    jankenHand,
    cardId,
    path: [`${roundId}:start`, `${roundId}:${jankenHand}:end`],
    direction: jankenHand === 'ROCK' ? 'RIGHT' : jankenHand === 'SCISSORS' ? 'CENTER' : 'LEFT',
    roadId: `road-${jankenHand}`,
    battleId: `battle-${roundId}`,
    opponentId: `opponent-${jankenHand}`,
    shieldLane: jankenHand === 'ROCK' ? 'LEFT' : jankenHand === 'SCISSORS' ? 'CENTER' : 'RIGHT',
    shieldRef: `shield-${jankenHand}`,
  };
}

function harness({ snapshot = currentSnapshot(), mutateAfterReads = null, candidateOverride = null } = {}) {
  let syncCalls = 0;
  const requests = [];
  const liveConsumer = {
    async syncRoundStart() {
      syncCalls += 1;
      if (syncCalls > 1 && mutateAfterReads) return mutateAfterReads;
      return snapshot;
    },
  };
  const readCompoundAttackCandidate = async (request) => {
    requests.push(request);
    return candidateOverride ? candidateOverride(request, requests.length) : candidate(request);
  };
  const readContext = createBattleJankenFocusAuthorityContextReader({
    liveConsumer,
    readCompoundAttackCandidate,
  });
  return { readContext, requests, get syncCalls() { return syncCalls; } };
}

test('reads exactly ROCK, SCISSORS, PAPER from the existing immutable CURRENT_HAND3_POLICY snapshot', async () => {
  const snapshot = currentSnapshot();
  const h = harness({ snapshot });
  const context = await h.readContext({ roundId: snapshot.roundId, assignment: snapshot });

  assert.equal(context.schema, BATTLE_JANKEN_FOCUS_AUTHORITY_CONTEXT_SCHEMA);
  assert.equal(context.generationId, snapshot.roundId);
  assert.strictEqual(context.assignment, snapshot);
  assert.equal(h.syncCalls, 2);
  assert.deepEqual(h.requests, [
    { roundId: snapshot.roundId, jankenHand: 'ROCK', cardId: 'card-c' },
    { roundId: snapshot.roundId, jankenHand: 'SCISSORS', cardId: 'card-a' },
    { roundId: snapshot.roundId, jankenHand: 'PAPER', cardId: 'card-b' },
  ]);
  assert.deepEqual(context.packages.map((pkg) => [pkg.jankenHand, pkg.cardId]), [
    ['ROCK', 'card-c'],
    ['SCISSORS', 'card-a'],
    ['PAPER', 'card-b'],
  ]);
  assert.equal(Object.isFrozen(context), true);
  assert.equal(Object.isFrozen(context.packages), true);
  assert.equal(context.gameplayAuthority, false);
  assert.equal(context.gameStateWrite, false);
});

test('native card suit never remaps the existing Hand3 assignment', async () => {
  const snapshot = currentSnapshot();
  const h = harness({ snapshot });
  const context = await h.readContext({ roundId: snapshot.roundId, assignment: snapshot });

  assert.equal(context.packages[0].cardId, 'card-c');
  assert.equal(snapshot.slots.find((slot) => slot.jankenHand === 'ROCK').nativeSuit, 'DI');
  assert.equal(context.packages[1].cardId, 'card-a');
  assert.equal(snapshot.slots.find((slot) => slot.jankenHand === 'SCISSORS').nativeSuit, 'SP');
  assert.equal(context.packages[2].cardId, 'card-b');
  assert.equal(snapshot.slots.find((slot) => slot.jankenHand === 'PAPER').nativeSuit, 'CL');
});

test('fails closed when SlidePad assignment does not match the current Hand3 authority', async () => {
  const snapshot = currentSnapshot();
  const mismatched = currentSnapshot('battle-round:9', {
    ROCK: 'card-a',
    SCISSORS: 'card-b',
    PAPER: 'card-c',
  });
  const h = harness({ snapshot });
  await assert.rejects(
    h.readContext({ roundId: snapshot.roundId, assignment: mismatched }),
    /assignment do not match/,
  );
  assert.equal(h.requests.length, 0);
});

test('fails closed before candidate reads when the round identity differs', async () => {
  const snapshot = currentSnapshot();
  const h = harness({ snapshot });
  await assert.rejects(
    h.readContext({ roundId: 'battle-round:10', assignment: snapshot }),
    /round do not match/,
  );
  assert.equal(h.requests.length, 0);
});

test('rejects legacy suit-bound assignment instead of manufacturing a current Hand3 mapping', async () => {
  const hand = [
    { id: 'legacy-cl', suit: 'CL' },
    { id: 'legacy-di', suit: 'DI' },
    { id: 'legacy-sp', suit: 'SP' },
  ];
  const legacy = createRoundStartJankenSlotAssignment({
    roundId: 'battle-round:legacy',
    hand,
  });
  const h = harness({ snapshot: legacy });
  await assert.rejects(h.readContext({ roundId: legacy.roundId, assignment: legacy }), /CURRENT_HAND3_POLICY/);
  assert.equal(h.requests.length, 0);
});

test('rejects an authority candidate that changes the assigned hand or physical card', async () => {
  const snapshot = currentSnapshot();
  const h = harness({
    snapshot,
    candidateOverride(request) {
      const value = candidate(request);
      if (request.jankenHand === 'SCISSORS') return { ...value, cardId: 'other-card' };
      return value;
    },
  });
  await assert.rejects(
    h.readContext({ roundId: snapshot.roundId, assignment: snapshot }),
    /changed assigned janken hand or physical card/,
  );
});

test('fails closed if the immutable Hand3 assignment changes while the three-package context is being gathered', async () => {
  const snapshot = currentSnapshot();
  const changed = currentSnapshot('battle-round:10');
  const h = harness({ snapshot, mutateAfterReads: changed });
  await assert.rejects(
    h.readContext({ roundId: snapshot.roundId, assignment: snapshot }),
    /changed while Focus context was being read/,
  );
  assert.equal(h.requests.length, 3);
});

test('contract stays presentation-only and delegates all game-rule authority', () => {
  assert.equal(BATTLE_JANKEN_FOCUS_AUTHORITY_CONTEXT_CONTRACT.authority, 'NONE');
  assert.equal(BATTLE_JANKEN_FOCUS_AUTHORITY_CONTEXT_CONTRACT.requiresCurrentHand3Policy, true);
  assert.deepEqual(BATTLE_JANKEN_FOCUS_AUTHORITY_CONTEXT_CONTRACT.exactThreeHands, ['ROCK', 'SCISSORS', 'PAPER']);
  assert.equal(BATTLE_JANKEN_FOCUS_AUTHORITY_CONTEXT_CONTRACT.computesHandAssignment, false);
  assert.equal(BATTLE_JANKEN_FOCUS_AUTHORITY_CONTEXT_CONTRACT.computesTarget, false);
  assert.equal(BATTLE_JANKEN_FOCUS_AUTHORITY_CONTEXT_CONTRACT.computesLegality, false);
  assert.equal(BATTLE_JANKEN_FOCUS_AUTHORITY_CONTEXT_CONTRACT.computesRoute, false);
  assert.equal(BATTLE_JANKEN_FOCUS_AUTHORITY_CONTEXT_CONTRACT.computesShieldMapping, false);
  assert.equal(BATTLE_JANKEN_FOCUS_AUTHORITY_CONTEXT_CONTRACT.commitsBattleAction, false);
  assert.equal(BATTLE_JANKEN_FOCUS_AUTHORITY_CONTEXT_CONTRACT.gameStateWrite, false);
});
