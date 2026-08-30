import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_SELF_DECK_INSPECT_LIVE_ADAPTER,
  projectSelfRemainingDeckFromLiveMatch
} from '../browser/battle-self-deck-inspect-live-adapter.mjs';

function match(overrides = {}) {
  return {
    id: 'M-1',
    phase: 'plan',
    busy: false,
    resolutionSeq: 4,
    players: [
      { id: 'P1', human: true, deck: ['SP-2', 'SP-1', 'SP-2'] },
      { id: 'P2', human: false, deck: ['OP-1'] }
    ],
    ...overrides
  };
}

const ownerViewer = Object.freeze({ id: 'P1', authenticated: true });

test('stable local Battle state projects the authoritative human remaining deck', () => {
  const value = projectSelfRemainingDeckFromLiveMatch(match(), { viewer: ownerViewer });
  assert.equal(BATTLE_SELF_DECK_INSPECT_LIVE_ADAPTER.schema, 'GAMEROAD_BATTLE_SELF_DECK_INSPECT_LIVE_ADAPTER_V1');
  assert.deepEqual(value, {
    ok: true,
    status: 'ready',
    schema: 'GAMEROAD_BATTLE_SELF_DECK_INSPECT_V1',
    matchId: 'M-1',
    ownerPlayerId: 'P1',
    revision: 4,
    total: 3,
    typeCount: 2,
    cardCounts: [
      { cardId: 'SP-1', count: 1 },
      { cardId: 'SP-2', count: 2 }
    ]
  });
});

test('non-owner and unauthenticated viewers never receive card identities', () => {
  for (const viewer of [{ id: 'P2', authenticated: true }, { id: 'P1', authenticated: false }, null]) {
    const value = projectSelfRemainingDeckFromLiveMatch(match(), { viewer });
    assert.equal(value.ok, true);
    assert.equal(value.total, 3);
    assert.equal('typeCount' in value, false);
    assert.equal('cardCounts' in value, false);
  }
});

test('busy or resolve states fail closed instead of sampling an in-flight draw/refill', () => {
  assert.deepEqual(projectSelfRemainingDeckFromLiveMatch(match({ busy: true }), { viewer: ownerViewer }), {
    ok: false, status: 'unavailable', reason: 'MATCH_MUTATING'
  });
  assert.deepEqual(projectSelfRemainingDeckFromLiveMatch(match({ phase: 'resolve' }), { viewer: ownerViewer }), {
    ok: false, status: 'unavailable', reason: 'MATCH_MUTATING'
  });
});

test('friend guest hidden projection is never treated as authoritative deck data', () => {
  const projectedGuest = match({
    id: 'FRIEND-ROOM-1',
    players: [
      { id: 'P2', human: true, deck: ['__HIDDEN__', '__HIDDEN__'] },
      { id: 'P1', human: false, deck: ['__HIDDEN__'] }
    ]
  });
  assert.deepEqual(projectSelfRemainingDeckFromLiveMatch(projectedGuest, {
    viewer: { id: 'P2', authenticated: true }
  }), {
    ok: false, status: 'unavailable', reason: 'AUTHORITATIVE_DECK_UNAVAILABLE'
  });
});

test('owner identity must be unique and live revision must be valid', () => {
  assert.equal(projectSelfRemainingDeckFromLiveMatch(match({ players: [] }), { viewer: ownerViewer }).reason, 'HUMAN_OWNER_NOT_UNIQUE');
  assert.equal(projectSelfRemainingDeckFromLiveMatch(match({
    players: [
      { id: 'P1', human: true, deck: [] },
      { id: 'P2', human: true, deck: [] }
    ]
  }), { viewer: ownerViewer }).reason, 'HUMAN_OWNER_NOT_UNIQUE');
  assert.equal(projectSelfRemainingDeckFromLiveMatch(match({ resolutionSeq: -1 }), { viewer: ownerViewer }).reason, 'RESOLUTION_SEQ_INVALID');
});

test('invalid live card ids fail closed without leaking malformed contents', () => {
  const value = projectSelfRemainingDeckFromLiveMatch(match({
    players: [{ id: 'P1', human: true, deck: [' GOOD'] }]
  }), { viewer: ownerViewer });
  assert.deepEqual(value, { ok: false, status: 'unavailable', reason: 'AUTHORITATIVE_DECK_INVALID' });
  assert.equal('cardCounts' in value, false);
});

test('projection is detached from later deck mutation and a new revision reflects the next stable state', () => {
  const live = match();
  const before = projectSelfRemainingDeckFromLiveMatch(live, { viewer: ownerViewer });
  live.players[0].deck.shift();
  live.resolutionSeq += 1;
  const after = projectSelfRemainingDeckFromLiveMatch(live, { viewer: ownerViewer });

  assert.deepEqual(before.cardCounts, [
    { cardId: 'SP-1', count: 1 },
    { cardId: 'SP-2', count: 2 }
  ]);
  assert.equal(before.revision, 4);
  assert.deepEqual(after.cardCounts, [
    { cardId: 'SP-1', count: 1 },
    { cardId: 'SP-2', count: 1 }
  ]);
  assert.equal(after.revision, 5);
});
