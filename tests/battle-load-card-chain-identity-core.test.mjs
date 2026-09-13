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
