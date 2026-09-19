import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_LOAD_CARD_CHAIN_IDENTITY,
  projectBattleLoadCardChain
} from '../browser/battle-load-card-chain-identity-core.mjs';

function resolution(round, serial, players) {
  return {
    kind: 'battle_resolution',
    publicData: { round, serial, players }
  };
}

test('ke9 preserves the exact caller-authoritative LOAD card identity', () => {
  const out = projectBattleLoadCardChain({
    viewerPlayerId: 'P1',
    loadCard: { cardId: 'HT-7', label: 'ハート7' },
    loadJanken: 'rock',
    replay: { events: [] }
  });

  assert.equal(out.load.cardId, 'HT-7');
  assert.equal(out.load.label, 'ハート7');
  assert.deepEqual(out.load.janken, { key: 'rock', glyph: '✊', resolved: true });
  assert.equal(out.playedCards.length, 0);
  assert.equal(out.unresolved.load, false);
  assert.equal(out.unresolved.janken, false);
});

test('ke9 keeps unknown or forbidden janken fail-closed and never renders heart', () => {
  for (const value of [null, 'heart', '♥', 'lizard', '']) {
    const out = projectBattleLoadCardChain({
      viewerPlayerId: 'P1',
      loadCard: { cardId: 'SP-A' },
      loadJanken: value,
      replay: { events: [] }
    });
    assert.equal(out.load.cardId, 'SP-A');
    assert.deepEqual(out.load.janken, { key: null, glyph: '?', resolved: false });
    assert.equal(out.load.janken.glyph.includes('♥'), false);
  }
  assert.deepEqual(BATTLE_LOAD_CARD_CHAIN_IDENTITY.jankenKeys, ['rock', 'scissors', 'paper']);
  assert.deepEqual(BATTLE_LOAD_CARD_CHAIN_IDENTITY.forbiddenJankenGlyphs, ['♥']);
});

test('ke9 projects only accepted Battle-phase card origins for the viewer', () => {
  const replay = {
    events: [
      resolution(1, 1, [
        {
          id: 'P1',
          cards: [
            { cardId: 'ROAD-1', label: 'ロード1', origin: 'road' },
            { cardId: 'BATTLE-1', label: 'バトル1', origin: 'active_submission' },
            { cardId: 'EXTRA-1', label: '追加1', origin: 'ability_active_addition' }
          ]
        },
        { id: 'P2', cards: [{ cardId: 'SECRET-NOT-MINE', origin: 'active_submission' }] }
      ]),
      { kind: 'match_ended', publicData: { round: 1 } },
      resolution(2, 2, [
        { id: 'P1', cards: [{ cardId: 'SHIELD-1', label: 'シールド1', origin: 'auto_defense' }] },
        { id: 'P2', cards: [{ cardId: 'BATTLE-P2', origin: 'active_submission' }] }
      ])
    ]
  };

  const out = projectBattleLoadCardChain({ viewerPlayerId: 'P1', replay });
  assert.deepEqual(out.playedCards.map(card => card.cardId), ['BATTLE-1', 'EXTRA-1', 'SHIELD-1']);
  assert.deepEqual(out.playedCards.map(card => card.origin), [
    'active_submission',
    'ability_active_addition',
    'auto_defense'
  ]);
  assert.equal(out.playedCards.some(card => card.cardId === 'ROAD-1'), false);
  assert.equal(out.playedCards.some(card => card.cardId === 'SECRET-NOT-MINE'), false);
  assert.equal(out.playedCards.some(card => card.cardId === 'BATTLE-P2'), false);
});

test('ke9 preserves accepted replay order and duplicate physical occurrences without dedupe', () => {
  const replay = {
    events: [
      resolution(3, 7, [{
        id: 'P1',
        cards: [
          { cardId: 'CARD-X', origin: 'active_submission' },
          { cardId: 'CARD-X', origin: 'ability_active_addition' }
        ]
      }]),
      resolution(4, 8, [{ id: 'P1', cards: [{ cardId: 'CARD-Y', origin: 'active_submission' }] }])
    ]
  };

  const out = projectBattleLoadCardChain({ viewerPlayerId: 'P1', replay });
  assert.deepEqual(out.playedCards.map(card => card.cardId), ['CARD-X', 'CARD-X', 'CARD-Y']);
  assert.deepEqual(out.playedCards.map(card => [card.round, card.serial, card.eventIndex, card.cardIndex]), [
    [3, 7, 0, 0],
    [3, 7, 0, 1],
    [4, 8, 1, 0]
  ]);
  assert.equal(BATTLE_LOAD_CARD_CHAIN_IDENTITY.dedupePlayedCards, false);
});

test('ke9 accepts unresolved LOAD without inventing an identity', () => {
  const out = projectBattleLoadCardChain({ viewerPlayerId: 'P1', replay: { events: [] } });
  assert.equal(out.load, null);
  assert.deepEqual(out.unresolved, { load: true, janken: false });
});

test('ke9 rejects malformed identities instead of synthesizing card ids', () => {
  assert.throws(
    () => projectBattleLoadCardChain({ viewerPlayerId: '', replay: { events: [] } }),
    /VIEWER_PLAYER_ID_REQUIRED/
  );
  assert.throws(
    () => projectBattleLoadCardChain({ viewerPlayerId: 'P1', loadCard: {}, replay: { events: [] } }),
    /LOAD_CARD_ID_REQUIRED/
  );
  assert.throws(
    () => projectBattleLoadCardChain({
      viewerPlayerId: 'P1',
      replay: { events: [resolution(1, 1, [{ id: 'P1', cards: [{ origin: 'active_submission' }] }])] }
    }),
    /BATTLE_RESOLUTION_CARD_ID_REQUIRED/
  );
});

test('ke9 is presentation-only, frozen, and leaves caller data untouched', () => {
  const input = {
    viewerPlayerId: 'P1',
    loadCard: { cardId: 'DI-3', label: 'ダイヤ3' },
    loadJanken: 'paper',
    replay: {
      events: [resolution(1, 1, [{ id: 'P1', cards: [{ cardId: 'CL-2', origin: 'active_submission' }] }])]
    }
  };
  const before = structuredClone(input);
  const out = projectBattleLoadCardChain(input);

  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(out), true);
  assert.equal(Object.isFrozen(out.load), true);
  assert.equal(Object.isFrozen(out.playedCards), true);
  assert.equal(BATTLE_LOAD_CARD_CHAIN_IDENTITY.gameStateWrite, false);
  assert.equal(BATTLE_LOAD_CARD_CHAIN_IDENTITY.opponentPrivateReservationRead, false);
});

test('08く keeps one physical card identity from hand source through janken reservation, focus, LOAD and accepted used-card history', async () => {
  const {
    buildBattleJankenSlidePadModel,
    projectBattleLoadCardPreview,
    resolveBattleJankenSlotCardAction,
  } = await import('../browser/battle-janken-slidepad-runtime-mount.mjs');
  const {
    createRoundStartJankenSlotAssignment,
    NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE,
  } = await import('../browser/new-base-round-start-janken-slot-assignment-core.mjs');
  const {
    beginBattleJankenCommitPresentation,
    createBattleJankenFocusPresentation,
    enterBattleLoadFocus,
    focusBattleJankenPackage,
  } = await import('../browser/battle-janken-focus-presentation-core.mjs');

  const hand = [
    { id: 'CL-4', suit: 'CL', label: 'クラブ4' },
    { id: 'DI-7', suit: 'DI', label: 'ダイヤ7' },
    { id: 'SP-10', suit: 'SP', label: 'スペード10' },
  ];
  const assignment = createRoundStartJankenSlotAssignment({
    roundId: 'battle-round:lineage-r2',
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
  assert.equal(hand.some((card) => card.id === physicalCardId), true);
  assert.equal(assignment.sourceHandCardIds.includes(physicalCardId), true);
  assert.equal(assignment.selectedJankenCardIds.includes(physicalCardId), true);
  assert.equal(model.ordinaryHandCardIds.includes(physicalCardId), false);
  assert.equal(model.slots.find((slot) => slot.jankenHand === 'PAPER')?.cardId, physicalCardId);
  assert.equal(
    resolveBattleJankenSlotCardAction(model, 'PAPER', assignment.sourceHandCardIds),
    physicalCardId,
  );

  const loadPreview = projectBattleLoadCardPreview(model, 'PAPER');
  assert.equal(loadPreview?.cardId, physicalCardId);

  const packageFor = (jankenHand, cardId, opponentId, shieldLane) => Object.freeze({
    jankenHand,
    cardId,
    path: ['P1', `road-${jankenHand.toLowerCase()}`, opponentId],
    direction: jankenHand === 'ROCK' ? 'RIGHT' : jankenHand === 'PAPER' ? 'LEFT' : 'CENTER',
    roadId: `road-${jankenHand.toLowerCase()}`,
    battleId: 'battle-lineage-r2',
    opponentId,
    shieldLane,
    shieldRef: `${opponentId}:${shieldLane}`,
  });
  const packages = [
    packageFor('ROCK', 'CL-4', 'P2', 'LEFT'),
    packageFor('SCISSORS', 'DI-7', 'P3', 'CENTER'),
    packageFor('PAPER', physicalCardId, 'P4', 'RIGHT'),
  ];
  let focus = createBattleJankenFocusPresentation({
    packages,
    generationId: 'lineage-r2',
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
      events: [resolution(1, 1, [{
        id: 'P1',
        cards: [{
          cardId: physicalCardId,
          label: loadPreview.cardLabel,
          origin: 'active_submission',
        }],
      }])],
    },
  });

  assert.equal(chain.load?.cardId, physicalCardId);
  assert.deepEqual(chain.playedCards.map((card) => card.cardId), [physicalCardId]);
  assert.equal(new Set([
    physicalCardId,
    model.slots.find((slot) => slot.jankenHand === 'PAPER')?.cardId,
    loadPreview.cardId,
    focus.focusedPackage?.cardId,
    loadFocus.focusedPackage?.cardId,
    committing.focusedPackage?.cardId,
    chain.load?.cardId,
    chain.playedCards[0]?.cardId,
  ]).size, 1);
});

