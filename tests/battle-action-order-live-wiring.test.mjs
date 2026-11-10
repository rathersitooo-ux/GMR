import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattleActionOrderLiveBridge } from '../browser/battle-action-order-live-bridge.mjs';
import { buildBattleJankenProcessingOrderAuthoritySnapshot } from '../browser/battle-janken-processing-order-authority-adapter.mjs';
import {
  auditBattleScreenModel,
  createBattleScreenModel,
} from '../browser/battle-screen-presentation-core.mjs';

// Mirrors the live wiring in GAMEROAD.html resolveBattle (F1-115): the same
// three calls, in the same order, with the same shapes. The HTML itself is
// not importable, so this test proves the call chain composes with live-like
// data instead of trusting the wiring by inspection.
function publicCards() {
  return [
    { playerId: 'P1', cardId: 'C1', hand: 'PAPER', printedNumber: 5, displayNumber: 5 },
    { playerId: 'P2', cardId: 'C2', hand: 'ROCK', printedNumber: 2, displayNumber: 2 },
    { playerId: 'P3', cardId: 'C3', hand: null, printedNumber: 9, displayNumber: 9 },
    { playerId: 'P4', cardId: 'C4', hand: 'SCISSORS', printedNumber: 7, displayNumber: 7 },
  ];
}

function readActionOrderInput(cards) {
  return async () => {
    const snapshot = buildBattleJankenProcessingOrderAuthoritySnapshot({ publicCards: cards });
    if (!snapshot || snapshot.status !== 'RESOLVED') return null;
    const orderedCards = snapshot.processingOrder.map((id) => {
      const card = cards.find((candidate) => candidate.playerId === id);
      return {
        participantId: id,
        cardId: card.cardId,
        printedNumber: card.printedNumber,
        jankenHand: card.hand,
      };
    });
    return { orderedCards, resolution: snapshot.resolution, reducedMotion: false, lowPerf: false };
  };
}

function presentActionOrder(store, cards, winningPlayerIds) {
  return async (model) => {
    const participants = [
      { id: 'P1', label: 'P1' },
      { id: 'P2', label: 'P2' },
      { id: 'P3', label: 'P3' },
      { id: 'P4', label: 'P4' },
    ];
    const screenModel = createBattleScreenModel({
      participants,
      plan: {
        presentationOnly: true,
        authorityBoundary: 'accepted_public_event_only',
        kind: 'compare4',
        eventId: 'battle:M1:r1:action-order',
        publicData: {
          playerIds: ['P1', 'P2', 'P3', 'P4'],
          winnerIds: [...winningPlayerIds],
          publicCards: cards.map((card) => ({
            playerId: card.playerId,
            cardId: card.cardId,
            displayNumber: card.displayNumber ?? null,
            hand: card.hand,
          })),
        },
      },
      actionOrder: model,
      reducedMotion: false,
      lowPerf: false,
    });
    const audit = auditBattleScreenModel(screenModel);
    if (!audit.ok) throw new Error(`BATTLE_ACTION_ORDER_SCREEN_MODEL_REJECTED:${audit.defects.join(',')}`);
    store.lastActionOrderPresentation = { round: 1, eventId: 'battle:M1:r1:action-order', model, screenModel };
    return 'stored';
  };
}

test('wiring chain: snapshot, bridge and compare4 screen model compose with live-like data', async () => {
  const cards = publicCards();
  cards[2].hand = 'PAPER';
  const store = {};
  const bridge = createBattleActionOrderLiveBridge({
    readActionOrderInput: readActionOrderInput(cards),
    presentActionOrder: presentActionOrder(store, cards, ['P2']),
  });
  const result = await bridge.sync();
  assert.equal(result.ok, true);
  assert.equal(result.presented, true);
  assert.equal(result.presentResult, 'stored');
  const stored = store.lastActionOrderPresentation;
  assert.equal(stored.round, 1);
  // Printed-number ascending is the authoritative order.
  assert.deepEqual(stored.model.processingOrderParticipantIds, ['P2', 'P1', 'P4', 'P3']);
  assert.deepEqual(stored.screenModel.actionOrderChain.processingOrder, ['P2', 'P1', 'P4', 'P3']);
  assert.equal(stored.screenModel.phase, 'compare4');
  assert.equal(stored.screenModel.battlePhasePresentationMode, 'FULLSCREEN_ANIMATION');
  assert.equal(stored.screenModel.actionOrderChain.finalSlots.length, 4);
});

test('wiring chain: equal printed numbers do not present', async () => {
  const cards = publicCards();
  cards[2].hand = 'PAPER';
  cards[3].printedNumber = 5;
  cards[3].displayNumber = 5;
  let presented = 0;
  const bridge = createBattleActionOrderLiveBridge({
    readActionOrderInput: readActionOrderInput(cards),
    presentActionOrder: async () => { presented += 1; },
  });
  const result = await bridge.sync();
  assert.equal(result.ok, false);
  assert.equal(result.presented, false);
  assert.equal(result.reason, 'ACTION_ORDER_INPUT_MISSING');
  assert.equal(presented, 0);
});

test('wiring chain: a played card without a janken hand rejects instead of presenting', async () => {
  const cards = publicCards();
  let presented = 0;
  const bridge = createBattleActionOrderLiveBridge({
    readActionOrderInput: readActionOrderInput(cards),
    presentActionOrder: async () => { presented += 1; },
  });
  await assert.rejects(bridge.sync());
  assert.equal(presented, 0);
});
