import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBattleJankenOrderChain } from '../browser/battle-janken-order-chain-presentation-core.mjs';
import {
  BATTLE_JANKEN_ORDER_MOTION,
  auditBattleJankenOrderMotion,
  buildBattleJankenOrderMotion
} from '../browser/battle-janken-order-motion-core.mjs';

const PUBLIC_CARDS = [
  { playerId: 'p4', cardId: 'c4', displayNumber: 3, hand: 'gamma' },
  { playerId: 'p3', cardId: 'c3', displayNumber: 7, hand: 'gamma' },
  { playerId: 'p2', cardId: 'c2', displayNumber: 1, hand: 'beta' },
  { playerId: 'p1', cardId: 'c1', displayNumber: 9, hand: 'alpha' }
];

const RESOLUTION = {
  processingOrder: ['p1', 'p2', 'p3', 'p4'],
  resolvedWinners: ['p1'],
  unresolvedSurvivors: ['p3', 'p4'],
  invalidated: ['p2'],
  steps: [
    {
      processedPlayerId: 'p1',
      winningHand: 'alpha',
      resolvedWinner: true,
      invalidated: ['p2']
    },
    {
      processedPlayerId: 'p3',
      winningHand: 'gamma',
      resolvedWinner: false,
      invalidated: []
    },
    {
      processedPlayerId: 'p4',
      winningHand: 'gamma',
      resolvedWinner: false,
      invalidated: []
    }
  ]
};

function makeChain() {
  return buildBattleJankenOrderChain({ publicCards: PUBLIC_CARDS, resolution: RESOLUTION });
}

test('projects order-link establish -> current pop -> processed retreat without reordering authority', () => {
  const chain = makeChain();
  const motion = buildBattleJankenOrderMotion({ chain });

  assert.equal(motion.schema, 'gameroad.battle-janken-order-motion.v1');
  assert.equal(motion.motionMode, 'full');
  assert.deepEqual(motion.processingOrder, ['p1', 'p2', 'p3', 'p4']);
  assert.deepEqual(motion.subjects.map((subject) => subject.cardId), ['c1', 'c2', 'c3', 'c4']);
  assert.deepEqual(motion.sequenceBuild, [
    { phase: 'order-link-establish', sequenceIndex: 0, fromPlayerId: 'p1', toPlayerId: 'p2', action: 'link-establish' },
    { phase: 'order-link-establish', sequenceIndex: 1, fromPlayerId: 'p2', toPlayerId: 'p3', action: 'link-establish' },
    { phase: 'order-link-establish', sequenceIndex: 2, fromPlayerId: 'p3', toPlayerId: 'p4', action: 'link-establish' }
  ]);

  const first = motion.steps[0];
  assert.equal(first.currentPlayerId, 'p1');
  assert.equal(first.slots.find((slot) => slot.playerId === 'p1').action, 'current-pop');
  assert.equal(first.slots.find((slot) => slot.playerId === 'p2').action, 'invalidated-stay-skip');

  const second = motion.steps[1];
  assert.equal(second.currentPlayerId, 'p3');
  assert.equal(second.slots.find((slot) => slot.playerId === 'p1').action, 'processed-retreat');
  assert.equal(second.slots.find((slot) => slot.playerId === 'p2').action, 'invalidated-stay-skip');
  assert.equal(second.slots.find((slot) => slot.playerId === 'p3').action, 'current-pop');

  assert.equal(motion.steps.some((step) => step.currentPlayerId === 'p2'), false);
  assert.deepEqual(motion.finalSettle.map(({ playerId, sourceFinalState, action }) => ({ playerId, sourceFinalState, action })), [
    { playerId: 'p1', sourceFinalState: 'resolved-win', action: 'final-settled-win' },
    { playerId: 'p2', sourceFinalState: 'invalidated', action: 'final-settled-invalidated' },
    { playerId: 'p3', sourceFinalState: 'unresolved-final', action: 'final-settled-unresolved' },
    { playerId: 'p4', sourceFinalState: 'unresolved-final', action: 'final-settled-unresolved' }
  ]);
});

test('reduced-motion and low-perf keep the same semantic order without travel motion', () => {
  const chain = makeChain();
  const reduced = buildBattleJankenOrderMotion({ chain, reducedMotion: true });
  const lowPerf = buildBattleJankenOrderMotion({ chain, lowPerf: true });

  for (const motion of [reduced, lowPerf]) {
    assert.equal(motion.motionMode, 'semantic-only');
    assert.deepEqual(motion.processingOrder, chain.processingOrder);
    assert.deepEqual(motion.finalSettle.map((slot) => slot.sourceFinalState), chain.finalSlots.map((slot) => slot.visualState));
    assert.equal(motion.steps[0].slots.find((slot) => slot.playerId === 'p1').action, 'current-emphasis');
    assert.equal(motion.steps[1].slots.find((slot) => slot.playerId === 'p1').action, 'processed-settled');
    assert.equal(motion.steps[0].slots.find((slot) => slot.playerId === 'p2').action, 'invalidated-stay-skip');
    assert.equal(JSON.stringify(motion).includes('current-pop'), false);
    assert.equal(JSON.stringify(motion).includes('processed-retreat'), false);
  }
});

test('does not turn printed card numbers into a sorter or tie-breaker', () => {
  const chain = buildBattleJankenOrderChain({
    publicCards: [
      { playerId: 'p4', cardId: 'e4', displayNumber: 5, hand: 'gamma' },
      { playerId: 'p2', cardId: 'e2', displayNumber: 5, hand: 'gamma' },
      { playerId: 'p1', cardId: 'e1', displayNumber: 5, hand: 'gamma' }
    ],
    resolution: {
      processingOrder: ['p4', 'p2', 'p1'],
      resolvedWinners: [],
      unresolvedSurvivors: ['p4', 'p2', 'p1'],
      invalidated: [],
      steps: [
        { processedPlayerId: 'p4', winningHand: 'gamma', resolvedWinner: false, invalidated: [] },
        { processedPlayerId: 'p2', winningHand: 'gamma', resolvedWinner: false, invalidated: [] },
        { processedPlayerId: 'p1', winningHand: 'gamma', resolvedWinner: false, invalidated: [] }
      ]
    }
  });

  const motion = buildBattleJankenOrderMotion({ chain });
  assert.deepEqual(motion.processingOrder, ['p4', 'p2', 'p1']);
  assert.deepEqual(motion.subjects.map((subject) => subject.cardId), ['e4', 'e2', 'e1']);
});

test('fails closed when the supplied chain no longer preserves one authoritative identity/order', () => {
  const chain = makeChain();
  const badFrame = {
    ...chain.frames[0],
    slots: chain.frames[0].slots.map((slot, index) => index === 0 ? { ...slot, playerId: 'px' } : slot)
  };
  assert.throws(
    () => buildBattleJankenOrderMotion({ chain: { ...chain, frames: [badFrame, ...chain.frames.slice(1)] } }),
    /FRAME_SLOT_ORDER_MISMATCH/
  );

  assert.throws(
    () => buildBattleJankenOrderMotion({ chain: { ...chain, sequenceEdges: [...chain.sequenceEdges].reverse() } }),
    /SEQUENCE_EDGE_ORDER_MISMATCH/
  );
});

test('declares a presentation-only motion boundary and freezes the projected model', () => {
  const motion = buildBattleJankenOrderMotion({ chain: makeChain() });
  assert.equal(motion.presentationOnly, true);
  assert.equal(motion.gameplayAuthority, false);
  assert.equal(motion.gameStateWrite, false);
  assert.equal(motion.orderCalculation, false);
  assert.equal(motion.comparisonCalculation, false);
  assert.equal(motion.winnerCalculation, false);
  assert.equal(motion.targetCalculation, false);
  assert.equal(motion.physicalTimingAuthority, false);
  assert.equal(auditBattleJankenOrderMotion(motion).ok, true);
  assert.equal(Object.isFrozen(motion), true);
  assert.equal(Object.isFrozen(motion.steps), true);
  assert.equal(Object.isFrozen(motion.steps[0].slots), true);

  assert.equal(BATTLE_JANKEN_ORDER_MOTION.authority, 'NONE_PRESENTATION_ONLY');
  assert.equal(BATTLE_JANKEN_ORDER_MOTION.sourceAuthority, 'WORKUNIT27_ORDER_CHAIN');
  assert.equal(BATTLE_JANKEN_ORDER_MOTION.sortingOwnedHere, false);
  assert.equal(BATTLE_JANKEN_ORDER_MOTION.comparisonOwnedHere, false);
  assert.equal(BATTLE_JANKEN_ORDER_MOTION.gameplayOwnedHere, false);
  assert.equal(BATTLE_JANKEN_ORDER_MOTION.physicalTimingOwnedHere, false);
  assert.equal(BATTLE_JANKEN_ORDER_MOTION.invalidatedCardsRemainInOrderSlot, true);
});
