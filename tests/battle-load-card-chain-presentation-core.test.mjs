import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBattleLoadCardChainPresentation,
  verifyBattleLoadCommitTransition,
} from '../browser/battle-load-card-chain-presentation-core.mjs';

const PLAYED = [
  { cardId: 'card-a', name: 'A', art: '/a.png' },
  { cardId: 'card-b', name: 'B', art: '/b.png' },
];

test('keeps the authoritative LOAD card identity while janken remains secondary annotation', () => {
  const result = buildBattleLoadCardChainPresentation({
    loadCard: { cardId: 'card-load', name: 'Load', art: '/load.png' },
    loadJanken: 'rock',
    playedCards: PLAYED,
  });

  assert.equal(result.status, 'ready');
  assert.equal(result.loadSlot.identityState, 'resolved');
  assert.equal(result.loadSlot.card.cardId, 'card-load');
  assert.equal(result.loadSlot.card.art, '/load.png');
  assert.equal(result.loadSlot.jankenHand, 'rock');
  assert.deepEqual(result.playedCards.map((card) => card.cardId), ['card-a', 'card-b']);
  assert.deepEqual(result.commitCandidate, {
    cardId: 'card-load',
    source: 'authoritative-load-card',
  });
});

test('preserves the caller-provided played Battle-card order and only derives sequence edges from it', () => {
  const result = buildBattleLoadCardChainPresentation({
    loadCard: { cardId: 'card-load' },
    loadJanken: 'paper',
    playedCards: [PLAYED[1], PLAYED[0]],
  });

  assert.deepEqual(result.playedSequence.map((slot) => slot.cardId), ['card-b', 'card-a']);
  assert.deepEqual(result.sequenceEdges, [
    { kind: 'played-sequence', fromCardId: 'card-b', toCardId: 'card-a' },
  ]);
});

test('fails closed instead of inferring LOAD identity from art, label, generic id, or janken', () => {
  const result = buildBattleLoadCardChainPresentation({
    loadCard: {
      id: 'must-not-be-used',
      name: 'Visible label',
      art: '/looks-real.png',
    },
    loadJanken: 'scissors',
    playedCards: PLAYED,
  });

  assert.equal(result.status, 'load-identity-unresolved');
  assert.equal(result.loadSlot.identityState, 'unresolved');
  assert.equal(result.loadSlot.card, null);
  assert.equal(result.loadSlot.jankenHand, 'scissors');
  assert.equal(result.commitCandidate, null);
  assert.doesNotMatch(JSON.stringify(result), /must-not-be-used|looks-real|Visible label/);
});

test('verifies that commit appends the exact current LOAD cardId after the unchanged played prefix', () => {
  const result = verifyBattleLoadCommitTransition({
    before: {
      loadCard: { cardId: 'card-load', art: '/load.png' },
      loadJanken: 'rock',
      playedCards: PLAYED,
    },
    after: {
      loadCard: null,
      loadJanken: null,
      playedCards: [...PLAYED, { cardId: 'card-load', art: '/load.png' }],
    },
  });

  assert.deepEqual(result, {
    cardId: 'card-load',
    previousPlayedCount: 2,
    committedIndex: 2,
  });
});

test('rejects identity substitution, played-prefix reordering, and non-single-card append transitions', () => {
  const before = {
    loadCard: { cardId: 'card-load' },
    loadJanken: 'rock',
    playedCards: PLAYED,
  };

  assert.throws(() => verifyBattleLoadCommitTransition({
    before,
    after: { playedCards: [...PLAYED, { cardId: 'different-card' }] },
  }), /does not match LOAD cardId/);

  assert.throws(() => verifyBattleLoadCommitTransition({
    before,
    after: { playedCards: [PLAYED[1], PLAYED[0], { cardId: 'card-load' }] },
  }), /played card order changed/);

  assert.throws(() => verifyBattleLoadCommitTransition({
    before,
    after: { playedCards: PLAYED },
  }), /append exactly one/);

  assert.throws(() => verifyBattleLoadCommitTransition({
    before,
    after: { playedCards: [...PLAYED, { cardId: 'card-load' }, { cardId: 'extra' }] },
  }), /append exactly one/);
});

test('rejects commit verification when the pre-commit LOAD identity is unresolved', () => {
  assert.throws(() => verifyBattleLoadCommitTransition({
    before: {
      loadCard: { name: 'No authoritative cardId', art: '/unknown.png' },
      loadJanken: 'paper',
      playedCards: PLAYED,
    },
    after: {
      playedCards: [...PLAYED, { cardId: 'guessed-card' }],
    },
  }), /LOAD card identity is unresolved/);
});

test('requires every already-played card to carry its authoritative cardId', () => {
  assert.throws(() => buildBattleLoadCardChainPresentation({
    loadCard: { cardId: 'card-load' },
    loadJanken: 'rock',
    playedCards: [{ id: 'not-card-id' }],
  }), /playedCards\[0\] cardId must be a non-empty string/);
});

test('contains no heart replacement semantic in the projected LOAD contract', () => {
  const result = buildBattleLoadCardChainPresentation({
    loadCard: { cardId: 'card-load' },
    loadJanken: 'rock',
    playedCards: PLAYED,
  });

  assert.doesNotMatch(JSON.stringify(result), /heart/i);
});
