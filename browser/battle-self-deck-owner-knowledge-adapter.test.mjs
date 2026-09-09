import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_SELF_DECK_OWNER_KNOWLEDGE_ADAPTER,
  createOwnerSelfRemainingDeckPresentationInput
} from './battle-self-deck-owner-knowledge-adapter.mjs';
import { projectLiveBattleRemainingDeckPresentation } from './battle-replay-live-adapter.mjs';

function stateWithOwnerDeck(deck) {
  return {
    match: {
      id: 'MATCH-OWNER-DECK-1',
      players: [
        { id: 'P1', human: true, deck: [...deck] },
        { id: 'P2', human: false, deck: ['OPPONENT_SECRET_CARD'] },
        { id: 'P3', human: false, deck: ['OPPONENT_SECRET_CARD_2'] },
        { id: 'P4', human: false, deck: [] }
      ]
    }
  };
}

const ownerViewer = Object.freeze({ authenticated: true, id: 'P1' });

test('owner-self live deck becomes revision-matched viewer knowledge and existing presentation counts', () => {
  const state = stateWithOwnerDeck(['CARD-B', 'CARD-A', 'CARD-A', 'CARD-C']);
  const prepared = createOwnerSelfRemainingDeckPresentationInput({
    state,
    viewer: ownerViewer,
    revision: 7
  });

  assert.equal(prepared.ok, true);
  assert.equal(prepared.orderHidden, true);
  assert.equal(prepared.opponentDeckRead, false);
  assert.equal(prepared.gameStateWrite, false);
  assert.deepEqual(prepared.presentationInput, {
    matchId: 'MATCH-OWNER-DECK-1',
    ownerPlayerId: 'P1',
    remainingCount: 4,
    revision: 7,
    viewer: { authenticated: true, id: 'P1' },
    viewerKnowledge: {
      schema: 'GAMEROAD_BATTLE_REMAINING_DECK_VIEWER_KNOWLEDGE_V1',
      matchId: 'MATCH-OWNER-DECK-1',
      revision: 7,
      viewerId: 'P1',
      events: [
        { cardId: 'CARD-A', kind: 'INITIAL_KNOWN', sequence: 0 },
        { cardId: 'CARD-A', kind: 'INITIAL_KNOWN', sequence: 1 },
        { cardId: 'CARD-B', kind: 'INITIAL_KNOWN', sequence: 2 },
        { cardId: 'CARD-C', kind: 'INITIAL_KNOWN', sequence: 3 }
      ]
    }
  });
  assert.equal(JSON.stringify(prepared).includes('OPPONENT_SECRET_CARD'), false);

  const presentation = projectLiveBattleRemainingDeckPresentation(prepared.presentationInput);
  assert.equal(presentation.ok, true);
  assert.equal(presentation.total, 4);
  assert.equal(presentation.knownCount, 4);
  assert.equal(presentation.unknownCount, 0);
  assert.equal(presentation.orderHidden, true);
  assert.deepEqual(presentation.knownCardCounts, [
    { cardId: 'CARD-A', count: 2 },
    { cardId: 'CARD-B', count: 1 },
    { cardId: 'CARD-C', count: 1 }
  ]);
});

test('different gameplay deck orders produce identical projection input', () => {
  const first = createOwnerSelfRemainingDeckPresentationInput({
    state: stateWithOwnerDeck(['CARD-C', 'CARD-A', 'CARD-B', 'CARD-A']),
    viewer: ownerViewer,
    revision: 9
  });
  const second = createOwnerSelfRemainingDeckPresentationInput({
    state: stateWithOwnerDeck(['CARD-A', 'CARD-B', 'CARD-A', 'CARD-C']),
    viewer: ownerViewer,
    revision: 9
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(first.presentationInput, second.presentationInput);
});

test('adapter does not read opponent deck identities', () => {
  const opponent = { id: 'P2', human: false };
  Object.defineProperty(opponent, 'deck', {
    enumerable: true,
    get() {
      throw new Error('OPPONENT_DECK_MUST_NOT_BE_READ');
    }
  });
  const state = {
    match: {
      id: 'MATCH-NO-OPPONENT-READ',
      players: [
        { id: 'P1', human: true, deck: ['SELF-1', 'SELF-2'] },
        opponent
      ]
    }
  };

  const prepared = createOwnerSelfRemainingDeckPresentationInput({
    state,
    viewer: ownerViewer,
    revision: 2
  });
  assert.equal(prepared.ok, true);
  assert.equal(prepared.presentationInput.remainingCount, 2);
});

test('unauthenticated and non-owner viewers fail closed without composition', () => {
  const state = stateWithOwnerDeck(['SELF-SECRET-A', 'SELF-SECRET-B']);
  const unauthenticated = createOwnerSelfRemainingDeckPresentationInput({
    state,
    viewer: { authenticated: false, id: 'P1' },
    revision: 3
  });
  const otherPlayer = createOwnerSelfRemainingDeckPresentationInput({
    state,
    viewer: { authenticated: true, id: 'P2' },
    revision: 3
  });

  assert.deepEqual(unauthenticated, {
    ok: false,
    status: 'unavailable',
    reason: 'VIEWER_AUTHENTICATION_REQUIRED'
  });
  assert.deepEqual(otherPlayer, {
    ok: false,
    status: 'unavailable',
    reason: 'VIEWER_NOT_LOCAL_OWNER'
  });
  assert.equal(JSON.stringify(unauthenticated).includes('SELF-SECRET'), false);
  assert.equal(JSON.stringify(otherPlayer).includes('SELF-SECRET'), false);
});

test('local owner ambiguity and malformed live deck fail closed', () => {
  const ambiguous = createOwnerSelfRemainingDeckPresentationInput({
    state: {
      match: {
        id: 'MATCH-AMBIGUOUS',
        players: [
          { id: 'P1', human: true, deck: ['A'] },
          { id: 'P2', human: true, deck: ['B'] }
        ]
      }
    },
    viewer: ownerViewer,
    revision: 1
  });
  const malformed = createOwnerSelfRemainingDeckPresentationInput({
    state: stateWithOwnerDeck(['GOOD', ' bad ']),
    viewer: ownerViewer,
    revision: 1
  });

  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.reason, 'LOCAL_OWNER_AMBIGUOUS');
  assert.equal(malformed.ok, false);
  assert.equal(malformed.reason, 'REMAINING_DECK_INVALID');
});

test('invalid revision is rejected before any composition is returned', () => {
  const result = createOwnerSelfRemainingDeckPresentationInput({
    state: stateWithOwnerDeck(['SELF-SECRET-A']),
    viewer: ownerViewer,
    revision: -1
  });
  assert.deepEqual(result, {
    ok: false,
    status: 'unavailable',
    reason: 'REVISION_INVALID'
  });
  assert.equal(JSON.stringify(result).includes('SELF-SECRET'), false);
});

test('empty remaining deck is a valid owner-self projection', () => {
  const prepared = createOwnerSelfRemainingDeckPresentationInput({
    state: stateWithOwnerDeck([]),
    viewer: ownerViewer,
    revision: 10
  });
  assert.equal(prepared.ok, true);
  assert.equal(prepared.presentationInput.remainingCount, 0);
  assert.deepEqual(prepared.presentationInput.viewerKnowledge.events, []);

  const presentation = projectLiveBattleRemainingDeckPresentation(prepared.presentationInput);
  assert.equal(presentation.ok, true);
  assert.equal(presentation.total, 0);
  assert.equal(presentation.knownCount, 0);
  assert.equal(presentation.unknownCount, 0);
});

test('projection output is detached and frozen without freezing live gameplay state', () => {
  const state = stateWithOwnerDeck(['CARD-B', 'CARD-A']);
  const prepared = createOwnerSelfRemainingDeckPresentationInput({
    state,
    viewer: ownerViewer,
    revision: 5
  });

  assert.equal(prepared.ok, true);
  assert.equal(Object.isFrozen(prepared), true);
  assert.equal(Object.isFrozen(prepared.presentationInput.viewerKnowledge.events), true);
  assert.equal(Object.isFrozen(state), false);
  assert.equal(Object.isFrozen(state.match), false);
  assert.equal(Object.isFrozen(state.match.players[0]), false);
  assert.equal(Object.isFrozen(state.match.players[0].deck), false);

  state.match.players[0].deck.push('CARD-C');
  assert.equal(state.match.players[0].deck.length, 3);
  assert.equal(prepared.presentationInput.remainingCount, 2);
  assert.deepEqual(
    prepared.presentationInput.viewerKnowledge.events.map(event => event.cardId),
    ['CARD-A', 'CARD-B']
  );
});

test('published adapter contract declares existing authority and zero game-state writes', () => {
  assert.equal(BATTLE_SELF_DECK_OWNER_KNOWLEDGE_ADAPTER.sourceAuthority, 'state.match.players[].deck');
  assert.equal(BATTLE_SELF_DECK_OWNER_KNOWLEDGE_ADAPTER.orderHidden, true);
  assert.equal(BATTLE_SELF_DECK_OWNER_KNOWLEDGE_ADAPTER.opponentDeckRead, false);
  assert.equal(BATTLE_SELF_DECK_OWNER_KNOWLEDGE_ADAPTER.gameStateWrite, false);
});
