import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBattleJankenSlidePadModel,
  projectBattleLoadCardPreview,
  resolveBattleJankenSlotCardAction,
} from '../browser/battle-janken-slidepad-runtime-mount.mjs';
import {
  createRoundStartJankenSlotAssignment,
  NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE,
} from '../browser/new-base-round-start-janken-slot-assignment-core.mjs';
import {
  beginBattleJankenCommitPresentation,
  createBattleJankenFocusPresentation,
  enterBattleLoadFocus,
  focusBattleJankenPackage,
} from '../browser/battle-janken-focus-presentation-core.mjs';
import {
  projectBattleLoadCardChain,
} from '../browser/battle-load-card-chain-identity-core.mjs';

function packageFor(jankenHand, cardId, opponentId, shieldLane) {
  return Object.freeze({
    jankenHand,
    cardId,
    path: ['P1', `road-${jankenHand.toLowerCase()}`, opponentId],
    direction: jankenHand === 'ROCK' ? 'RIGHT' : jankenHand === 'PAPER' ? 'LEFT' : 'CENTER',
    roadId: `road-${jankenHand.toLowerCase()}`,
    battleId: 'battle-lineage-r1',
    opponentId,
    shieldLane,
    shieldRef: `${opponentId}:${shieldLane}`,
  });
}

test('08く keeps one physical card identity from hand source through janken reservation, focus, LOAD and accepted used-card history', () => {
  const hand = [
    { id: 'CL-4', suit: 'CL', label: 'クラブ4' },
    { id: 'DI-7', suit: 'DI', label: 'ダイヤ7' },
    { id: 'SP-10', suit: 'SP', label: 'スペード10' },
    { id: 'HT-2', suit: 'HT', label: 'ハート2' },
  ];

  // This is an already-authoritative mid-turn Hand3 fixture. It does not
  // decide the unresolved opening-7 -> first Hand3 selection rule.
  const assignment = createRoundStartJankenSlotAssignment({
    roundId: 'battle-round:lineage-r1',
    hand,
    assignmentMode: NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE.CURRENT_HAND3_POLICY,
    assignedCardIdsByJankenHand: {
      ROCK: 'CL-4',
      SCISSORS: 'DI-7',
      PAPER: 'SP-10',
    },
  });

  const model = buildBattleJankenSlidePadModel({
    roundId: assignment.roundId,
    hand,
    currentSnapshot: assignment,
  });

  const physicalCardId = 'SP-10';
  assert.equal(hand.some((card) => card.id === physicalCardId), true, 'the physical card starts in the authoritative hand source');
  assert.equal(assignment.sourceHandCardIds.includes(physicalCardId), true);
  assert.equal(assignment.selectedJankenCardIds.includes(physicalCardId), true);
  assert.equal(model.ordinaryHandCardIds.includes(physicalCardId), false, 'reservation must not duplicate the same physical card back into ordinary hand membership');
  assert.equal(model.slots.find((slot) => slot.jankenHand === 'PAPER')?.cardId, physicalCardId);
  assert.equal(
    resolveBattleJankenSlotCardAction(model, 'PAPER', assignment.sourceHandCardIds),
    physicalCardId,
    'the reserved slot must resolve back to the exact hand-source card',
  );

  const loadPreview = projectBattleLoadCardPreview(model, 'PAPER');
  assert.equal(loadPreview?.cardId, physicalCardId);

  const packages = [
    packageFor('ROCK', 'CL-4', 'P2', 'LEFT'),
    packageFor('SCISSORS', 'DI-7', 'P3', 'CENTER'),
    packageFor('PAPER', physicalCardId, 'P4', 'RIGHT'),
  ];
  let focus = createBattleJankenFocusPresentation({
    packages,
    generationId: 'lineage-r1',
  });
  focus = focusBattleJankenPackage(focus, 'PAPER', { previewReady: true });
  assert.equal(focus.focusedPackage?.cardId, physicalCardId);
  assert.equal(focus.focusedPreview?.cardId, physicalCardId);

  const loadFocus = enterBattleLoadFocus(focus);
  assert.equal(loadFocus.focusedPackage?.cardId, physicalCardId);
  const committing = beginBattleJankenCommitPresentation(loadFocus);
  assert.equal(committing.focusedPackage?.cardId, physicalCardId);

  const chain = projectBattleLoadCardChain({
    viewerPlayerId: 'P1',
    loadCard: { cardId: loadPreview.cardId, label: loadPreview.cardLabel },
    loadJanken: 'paper',
    replay: {
      events: [{
        kind: 'battle_resolution',
        publicData: {
          round: 1,
          serial: 1,
          players: [{
            id: 'P1',
            cards: [{
              cardId: physicalCardId,
              label: loadPreview.cardLabel,
              origin: 'active_submission',
            }],
          }],
        },
      }],
    },
  });

  assert.equal(chain.load?.cardId, physicalCardId);
  assert.deepEqual(chain.playedCards.map((card) => card.cardId), [physicalCardId]);
  assert.equal(
    new Set([
      physicalCardId,
      model.slots.find((slot) => slot.jankenHand === 'PAPER')?.cardId,
      loadPreview.cardId,
      focus.focusedPackage?.cardId,
      loadFocus.focusedPackage?.cardId,
      committing.focusedPackage?.cardId,
      chain.load?.cardId,
      chain.playedCards[0]?.cardId,
    ]).size,
    1,
    'ordinary-hand source, reserved slot, focus, LOAD, commit presentation and used history must all point at one physical card identity',
  );
});
