import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_SELF_DECK_OWNER_KNOWLEDGE_ADAPTER,
  createOwnerSelfRemainingDeckPresentationInput
} from '../browser/battle-self-deck-owner-knowledge-adapter.mjs';
import { projectLiveBattleRemainingDeckPresentation } from '../browser/battle-replay-live-adapter.mjs';

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
  const prepared = createOwnerSelfRemainingDeckPresentationInput({ state, viewer: ownerViewer, revision: 7 });

  assert.equal(prepared.ok, true);
  assert.equal(prepared.orderHidden, true);
  assert.equal(prepared.opponentDeckRead, false);
  assert.equal(prepared.gameStateWrite, false);
  assert.equal(JSON.stringify(prepared).includes('OPPONENT_SECRET_CARD'), false);
  assert.deepEqual(
    prepared.presentationInput.viewerKnowledge.events.map(event => event.cardId),
    ['CARD-A', 'CARD-A', 'CARD-B', 'CARD-C']
  );

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

test('adapter never reads opponent deck identities', () => {
  const opponent = { id: 'P2', human: false };
  Object.defineProperty(opponent, 'deck', {
    enumerable: true,
    get() { throw new Error('OPPONENT_DECK_MUST_NOT_BE_READ'); }
  });
  const prepared = createOwnerSelfRemainingDeckPresentationInput({
    state: { match: { id: 'MATCH-NO-OPPONENT-READ', players: [
      { id: 'P1', human: true, deck: ['SELF-1', 'SELF-2'] }, opponent
    ] } },
    viewer: ownerViewer,
    revision: 2
  });
  assert.equal(prepared.ok, true);
  assert.equal(prepared.presentationInput.remainingCount, 2);
});

test('unauthenticated and non-owner viewers fail closed without composition', () => {
  const state = stateWithOwnerDeck(['SELF-SECRET-A', 'SELF-SECRET-B']);
  const unauthenticated = createOwnerSelfRemainingDeckPresentationInput({
    state, viewer: { authenticated: false, id: 'P1' }, revision: 3
  });
  const otherPlayer = createOwnerSelfRemainingDeckPresentationInput({
    state, viewer: { authenticated: true, id: 'P2' }, revision: 3
  });
  assert.equal(unauthenticated.reason, 'VIEWER_AUTHENTICATION_REQUIRED');
  assert.equal(otherPlayer.reason, 'VIEWER_NOT_LOCAL_OWNER');
  assert.equal(JSON.stringify(unauthenticated).includes('SELF-SECRET'), false);
  assert.equal(JSON.stringify(otherPlayer).includes('SELF-SECRET'), false);
});

test('ambiguous owner, malformed deck, and invalid revision fail closed', () => {
  const ambiguous = createOwnerSelfRemainingDeckPresentationInput({
    state: { match: { id: 'MATCH-AMBIGUOUS', players: [
      { id: 'P1', human: true, deck: ['A'] },
      { id: 'P2', human: true, deck: ['B'] }
    ] } },
    viewer: ownerViewer,
    revision: 1
  });
  const malformed = createOwnerSelfRemainingDeckPresentationInput({
    state: stateWithOwnerDeck(['GOOD', ' bad ']), viewer: ownerViewer, revision: 1
  });
  const invalidRevision = createOwnerSelfRemainingDeckPresentationInput({
    state: stateWithOwnerDeck(['SELF-SECRET-A']), viewer: ownerViewer, revision: -1
  });
  assert.equal(ambiguous.reason, 'LOCAL_OWNER_AMBIGUOUS');
  assert.equal(malformed.reason, 'REMAINING_DECK_INVALID');
  assert.equal(invalidRevision.reason, 'REVISION_INVALID');
});

test('empty remaining deck is valid and live gameplay state stays mutable', () => {
  const empty = createOwnerSelfRemainingDeckPresentationInput({
    state: stateWithOwnerDeck([]), viewer: ownerViewer, revision: 10
  });
  assert.equal(empty.ok, true);
  assert.equal(empty.presentationInput.remainingCount, 0);
  assert.deepEqual(empty.presentationInput.viewerKnowledge.events, []);
  const emptyPresentation = projectLiveBattleRemainingDeckPresentation(empty.presentationInput);
  assert.equal(emptyPresentation.ok, true);
  assert.equal(emptyPresentation.total, 0);

  const state = stateWithOwnerDeck(['CARD-B', 'CARD-A']);
  const prepared = createOwnerSelfRemainingDeckPresentationInput({ state, viewer: ownerViewer, revision: 5 });
  assert.equal(Object.isFrozen(prepared), true);
  assert.equal(Object.isFrozen(state.match.players[0].deck), false);
  state.match.players[0].deck.push('CARD-C');
  assert.equal(state.match.players[0].deck.length, 3);
  assert.equal(prepared.presentationInput.remainingCount, 2);
});

test('published adapter contract keeps existing authority and zero gameplay writes', () => {
  assert.equal(BATTLE_SELF_DECK_OWNER_KNOWLEDGE_ADAPTER.sourceAuthority, 'state.match.players[].deck');
  assert.equal(BATTLE_SELF_DECK_OWNER_KNOWLEDGE_ADAPTER.orderHidden, true);
  assert.equal(BATTLE_SELF_DECK_OWNER_KNOWLEDGE_ADAPTER.opponentDeckRead, false);
  assert.equal(BATTLE_SELF_DECK_OWNER_KNOWLEDGE_ADAPTER.gameStateWrite, false);
});
