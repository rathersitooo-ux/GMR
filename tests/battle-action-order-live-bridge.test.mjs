import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_ACTION_ORDER_LIVE_BRIDGE_CONTRACT,
  createBattleActionOrderLiveBridge,
} from '../browser/battle-action-order-live-bridge.mjs';

function validInput() {
  return {
    orderedCards: [
      { participantId: 'P2', cardId: 'C2', printedNumber: 2, jankenHand: 'ROCK' },
      { participantId: 'P1', cardId: 'C1', printedNumber: 5, jankenHand: 'PAPER' },
      { participantId: 'P4', cardId: 'C4', printedNumber: 7, jankenHand: 'SCISSORS' },
      { participantId: 'P3', cardId: 'C3', printedNumber: 9, jankenHand: null },
    ],
    resolution: {
      processingOrder: ['P2', 'P1', 'P4', 'P3'],
      resolvedWinners: ['P2'],
      invalidated: ['P1'],
      unresolvedSurvivors: ['P4', 'P3'],
      steps: [
        { processedPlayerId: 'P2', resolvedWinner: true, invalidated: [], survivors: ['P4', 'P3'], winningHand: 'ROCK' },
        { processedPlayerId: 'P4', resolvedWinner: false, invalidated: [], survivors: ['P3'] },
      ],
    },
  };
}

test('presents the caller-ordered model through the caller surface exactly once', async () => {
  const presented = [];
  const bridge = createBattleActionOrderLiveBridge({
    readActionOrderInput: async () => validInput(),
    presentActionOrder: async (model) => {
      presented.push(model);
      return 'surface-accepted';
    },
  });
  const result = await bridge.sync();
  assert.equal(result.ok, true);
  assert.equal(result.presented, true);
  assert.equal(result.presentResult, 'surface-accepted');
  assert.equal(presented.length, 1);
  const model = presented[0];
  assert.equal(model.schema, 'gameroad.battle-action-order-presentation.v1');
  assert.equal(model.presentationOnly, true);
  assert.equal(model.gameplayAuthority, false);
  assert.deepEqual(model.processingOrderParticipantIds, ['P2', 'P1', 'P4', 'P3']);
  assert.deepEqual(model.processingOrderCardIds, ['C2', 'C1', 'C4', 'C3']);
  assert.deepEqual(model.cards.map(card => card.orderBadge), [1, 2, 3, 4]);
  assert.deepEqual(model.cards.map(card => card.finalState), [
    'RESOLVED_WIN', 'INVALIDATED', 'UNRESOLVED', 'UNRESOLVED',
  ]);
  assert.equal(Object.isFrozen(model), true);
  assert.equal(bridge.status().inFlight, false);
});

test('does not present when the final states do not partition the players', async () => {
  let presented = 0;
  const bridge = createBattleActionOrderLiveBridge({
    readActionOrderInput: async () => {
      const input = validInput();
      // P3 ends up in no final list: the core must reject this.
      input.resolution.unresolvedSurvivors = ['P4'];
      return input;
    },
    presentActionOrder: async () => { presented += 1; },
  });
  const result = await bridge.sync();
  assert.equal(result.ok, false);
  assert.equal(result.presented, false);
  assert.match(result.reason, /FINAL_STATE_NOT_PARTITIONED/);
  assert.equal(presented, 0);
});

test('does not present when the processing order does not match the card order', async () => {
  let presented = 0;
  const bridge = createBattleActionOrderLiveBridge({
    readActionOrderInput: async () => {
      const input = validInput();
      input.resolution.processingOrder = ['P1', 'P2', 'P4', 'P3'];
      return input;
    },
    presentActionOrder: async () => { presented += 1; },
  });
  const result = await bridge.sync();
  assert.equal(result.ok, false);
  assert.equal(result.presented, false);
  assert.match(result.reason, /CALLER_ORDER_MISMATCH/);
  assert.equal(presented, 0);
});

test('does not present when the reader supplies no input', async () => {
  let presented = 0;
  const bridge = createBattleActionOrderLiveBridge({
    readActionOrderInput: async () => null,
    presentActionOrder: async () => { presented += 1; },
  });
  const result = await bridge.sync();
  assert.equal(result.ok, false);
  assert.equal(result.presented, false);
  assert.equal(result.reason, 'ACTION_ORDER_INPUT_MISSING');
  assert.equal(presented, 0);
});

test('does not present a model that fails the audit', async () => {
  let presented = 0;
  const bridge = createBattleActionOrderLiveBridge({
    readActionOrderInput: async () => validInput(),
    presentActionOrder: async () => { presented += 1; },
    projectActionOrder: () => ({
      schema: 'gameroad.battle-action-order-presentation.v1',
      presentationOnly: false,
      gameplayAuthority: true,
      gameStateWrite: true,
      orderCalculation: true,
      winnerCalculation: true,
      targetCalculation: true,
      secretProjectionAuthority: true,
      motion: 'presentation_allowed',
      processingOrderParticipantIds: ['P2', 'P1', 'P4', 'P3'],
      processingOrderCardIds: ['C2', 'C1', 'C4', 'C3'],
      cards: validInput().orderedCards.map((card, index) => ({
        ...card, orderIndex: index, orderBadge: index + 1, finalState: 'UNRESOLVED',
      })),
      steps: [],
    }),
  });
  const result = await bridge.sync();
  assert.equal(result.ok, false);
  assert.equal(result.presented, false);
  assert.match(result.reason, /ACTION_ORDER_MODEL_REJECTED/);
  assert.equal(presented, 0);
});

test('a second concurrent sync reports in-flight and presents only once', async () => {
  let presented = 0;
  let releasePresent;
  const presentStarted = new Promise(resolve => { releasePresent = resolve; });
  const bridge = createBattleActionOrderLiveBridge({
    readActionOrderInput: async () => validInput(),
    presentActionOrder: async () => {
      presented += 1;
      releasePresent();
      await new Promise(resolve => setTimeout(resolve, 10));
    },
  });
  const first = bridge.sync();
  await presentStarted;
  const second = await bridge.sync();
  assert.equal(second.ok, false);
  assert.equal(second.presented, false);
  assert.equal(second.reason, 'SYNC_IN_FLIGHT');
  await first;
  assert.equal(presented, 1);
});

test('reduced motion passes through to a static-only model', async () => {
  let presentedModel = null;
  const bridge = createBattleActionOrderLiveBridge({
    readActionOrderInput: async () => ({ ...validInput(), reducedMotion: true }),
    presentActionOrder: async (model) => { presentedModel = model; },
  });
  const result = await bridge.sync();
  assert.equal(result.ok, true);
  assert.equal(presentedModel.motion, 'static_only');
  assert.equal(presentedModel.reducedMotion, true);
});

test('contract owns no gameplay authority', () => {
  assert.equal(BATTLE_ACTION_ORDER_LIVE_BRIDGE_CONTRACT.schema, 'gameroad.battle-action-order-live-bridge.v1');
  assert.equal(BATTLE_ACTION_ORDER_LIVE_BRIDGE_CONTRACT.sortingOwnedHere, false);
  assert.equal(BATTLE_ACTION_ORDER_LIVE_BRIDGE_CONTRACT.winnerOwnedHere, false);
  assert.equal(BATTLE_ACTION_ORDER_LIVE_BRIDGE_CONTRACT.gameStateWrite, false);
  assert.deepEqual(
    BATTLE_ACTION_ORDER_LIVE_BRIDGE_CONTRACT.liveCallerSupplies,
    ['readActionOrderInput', 'presentActionOrder', 'sync trigger'],
  );
});
