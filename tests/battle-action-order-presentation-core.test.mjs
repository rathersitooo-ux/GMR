import assert from 'node:assert/strict';
import { resolveCyclicTriadByProcessingOrder } from '../browser/triad-resolver-core.mjs';
import {
  BATTLE_ACTION_ORDER_PRESENTATION,
  auditBattleActionOrderPresentation,
  projectBattleActionOrderChain
} from '../browser/battle-action-order-presentation-core.mjs';

const config = {
  handOrder: ['rock', 'scissors', 'paper'],
  beats: { rock: 'scissors', scissors: 'paper', paper: 'rock' }
};

const orderedSelections = [
  { playerId: 'P1', hand: 'rock' },
  { playerId: 'P2', hand: 'paper' },
  { playerId: 'P3', hand: 'scissors' },
  { playerId: 'P4', hand: 'rock' }
];
const orderedCards = [
  { participantId: 'P1', cardId: 'C1', printedNumber: 1, jankenHand: 'rock' },
  { participantId: 'P2', cardId: 'C2', printedNumber: 2, jankenHand: 'paper' },
  { participantId: 'P3', cardId: 'C3', printedNumber: 3, jankenHand: 'scissors' },
  { participantId: 'P4', cardId: 'C4', printedNumber: 4, jankenHand: 'rock' }
];
const resolution = resolveCyclicTriadByProcessingOrder(orderedSelections, config);
const model = projectBattleActionOrderChain({ orderedCards, resolution });

assert.equal(model.schema, 'gameroad.battle-action-order-presentation.v1');
assert.equal(model.presentationOnly, true);
assert.equal(model.gameplayAuthority, false);
assert.equal(model.gameStateWrite, false);
assert.equal(model.orderCalculation, false);
assert.equal(model.winnerCalculation, false);
assert.equal(model.targetCalculation, false);
assert.equal(model.secretProjectionAuthority, false);
assert.equal(model.orderSource, 'caller_supplied_authoritative_processing_order');
assert.equal(model.motion, 'presentation_allowed');
assert.deepEqual(model.processingOrderParticipantIds, ['P1', 'P2', 'P3', 'P4']);
assert.deepEqual(model.processingOrderCardIds, ['C1', 'C2', 'C3', 'C4']);
assert.deepEqual(model.cards.map(card => card.orderBadge), [1, 2, 3, 4]);
assert.deepEqual(model.cards.map(card => card.printedNumber), [1, 2, 3, 4]);
assert.deepEqual(model.cards.map(card => card.finalState), ['RESOLVED_WIN', 'RESOLVED_WIN', 'INVALIDATED', 'INVALIDATED']);
assert.deepEqual(model.steps.map(step => step.processedParticipantId), ['P1', 'P2']);
assert.deepEqual(model.steps.map(step => step.processedCardId), ['C1', 'C2']);
assert.deepEqual(model.steps[0].invalidatedParticipantIds, ['P3']);
assert.deepEqual(model.steps[0].invalidatedCardIds, ['C3']);
assert.deepEqual(model.steps[1].invalidatedParticipantIds, ['P4']);
assert.deepEqual(model.steps[1].invalidatedCardIds, ['C4']);
assert.equal(model.steps[0].resolvedWinner, true);
assert.equal(model.steps[1].resolvedWinner, true);
assert.equal(auditBattleActionOrderPresentation(model).ok, true);
assert.equal(Object.isFrozen(model), true);
assert.equal(Object.isFrozen(model.cards), true);
assert.equal(Object.isFrozen(model.steps), true);

// Equal printed numbers are deliberately NOT tie-broken or sorted here.
// The caller-provided authoritative order must survive byte-for-byte in meaning.
const equalNumberSelections = [
  { playerId: 'P4', hand: 'rock' },
  { playerId: 'P2', hand: 'rock' },
  { playerId: 'P1', hand: 'rock' }
];
const equalNumberCards = [
  { participantId: 'P4', cardId: 'E4', printedNumber: 5, jankenHand: 'rock' },
  { participantId: 'P2', cardId: 'E2', printedNumber: 5, jankenHand: 'rock' },
  { participantId: 'P1', cardId: 'E1', printedNumber: 5, jankenHand: 'rock' }
];
const equalResolution = resolveCyclicTriadByProcessingOrder(equalNumberSelections, config);
const equalModel = projectBattleActionOrderChain({ orderedCards: equalNumberCards, resolution: equalResolution });
assert.deepEqual(equalModel.processingOrderParticipantIds, ['P4', 'P2', 'P1']);
assert.deepEqual(equalModel.processingOrderCardIds, ['E4', 'E2', 'E1']);
assert.deepEqual(equalModel.cards.map(card => card.printedNumber), [5, 5, 5]);
assert.deepEqual(equalModel.cards.map(card => card.finalState), ['UNRESOLVED', 'UNRESOLVED', 'UNRESOLVED']);
assert.deepEqual(equalModel.steps.map(step => step.processedParticipantId), ['P4', 'P2', 'P1']);

const reduced = projectBattleActionOrderChain({ orderedCards, resolution, reducedMotion: true });
const lowPerf = projectBattleActionOrderChain({ orderedCards, resolution, lowPerf: true });
assert.equal(reduced.motion, 'static_only');
assert.equal(lowPerf.motion, 'static_only');
assert.deepEqual(reduced.processingOrderCardIds, model.processingOrderCardIds);
assert.deepEqual(lowPerf.cards.map(card => card.finalState), model.cards.map(card => card.finalState));

assert.throws(
  () => projectBattleActionOrderChain({
    orderedCards: [orderedCards[1], orderedCards[0], orderedCards[2], orderedCards[3]],
    resolution
  }),
  /CALLER_ORDER_MISMATCH/
);
assert.throws(
  () => projectBattleActionOrderChain({ orderedCards: [...orderedCards, { participantId: 'P5', cardId: 'C5', printedNumber: 5 }], resolution }),
  /CARDS_INVALID/
);
assert.throws(
  () => projectBattleActionOrderChain({ orderedCards: [orderedCards[0], { ...orderedCards[1], participantId: 'P1' }], resolution: { ...resolution, processingOrder: ['P1', 'P1'] } }),
  /PARTICIPANT_DUPLICATE/
);
assert.throws(
  () => projectBattleActionOrderChain({ orderedCards: [orderedCards[0], { ...orderedCards[1], cardId: 'C1' }], resolution: { ...resolution, processingOrder: ['P1', 'P2'] } }),
  /CARD_DUPLICATE/
);
assert.throws(
  () => projectBattleActionOrderChain({
    orderedCards,
    resolution: { ...resolution, invalidated: [...resolution.invalidated, 'PX'] }
  }),
  /UNKNOWN_INVALIDATED/
);
assert.throws(
  () => projectBattleActionOrderChain({
    orderedCards,
    resolution: { ...resolution, resolvedWinners: [...resolution.resolvedWinners, 'P3'] }
  }),
  /FINAL_STATE_NOT_PARTITIONED/
);
assert.throws(
  () => projectBattleActionOrderChain({
    orderedCards,
    resolution: {
      ...resolution,
      steps: [{ ...resolution.steps[0], invalidated: ['P1'] }]
    }
  }),
  /INVALIDATES_SELF/
);

assert.equal(BATTLE_ACTION_ORDER_PRESENTATION.authority, 'NONE_PRESENTATION_ONLY');
assert.equal(BATTLE_ACTION_ORDER_PRESENTATION.orderAuthority, 'CALLER');
assert.equal(BATTLE_ACTION_ORDER_PRESENTATION.resolutionAuthority, 'EXISTING_TRIAD_RESOLVER_OUTPUT');
assert.equal(BATTLE_ACTION_ORDER_PRESENTATION.sortingOwnedHere, false);
assert.equal(BATTLE_ACTION_ORDER_PRESENTATION.invalidatedDestinationOwnedHere, false);
assert.deepEqual(BATTLE_ACTION_ORDER_PRESENTATION.finalStates, ['RESOLVED_WIN', 'INVALIDATED', 'UNRESOLVED']);

console.log(JSON.stringify({
  ok: true,
  processingOrder: model.processingOrderCardIds,
  steps: model.steps.map(step => ({ cardId: step.processedCardId, invalidated: step.invalidatedCardIds })),
  finalStates: model.cards.map(card => [card.cardId, card.finalState])
}, null, 2));
