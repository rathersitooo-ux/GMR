import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_SELF_DECK_INSPECT_CORE,
  createAuthoritativeRemainingDeckCountSnapshot,
  createAuthoritativeRemainingDeckSnapshot,
  projectRemainingDeckCountForViewer,
  projectRemainingDeckForViewer,
  validateAuthoritativeRemainingDeckCountSnapshot,
  validateAuthoritativeRemainingDeckSnapshot
} from '../browser/battle-self-deck-inspect-core.mjs';
import { appendAcceptedEvent, createReplayLog, readReplay } from '../browser/battle-replay-core.mjs';

const versions = Object.freeze({ rules: 'rules-r1', content: 'content-r1', state: 'state-r1' });
const supportedVersions = Object.freeze({ rules: ['rules-r1'], content: ['content-r1'], state: ['state-r1'] });
const viewer = (id = 'P1', authenticated = true) => ({ id, authenticated });
const event = (sequence, kind, cardId) => ({ sequence, kind, cardId });
function snapshot(ids = ['SP-2', 'SP-1', 'SP-2', 'HT-1'], revision = 7) {
  return createAuthoritativeRemainingDeckSnapshot({ matchId: 'MATCH-1', ownerPlayerId: 'P1', revision, remainingCardIds: ids });
}
function countSnapshot(total = 4, revision = 7) {
  return createAuthoritativeRemainingDeckCountSnapshot({ matchId: 'MATCH-1', ownerPlayerId: 'P1', revision, remainingCount: total });
}
function knowledge({ viewerId = 'P1', revision = 7, events = [] } = {}) {
  return { schema: BATTLE_SELF_DECK_INSPECT_CORE.viewerKnowledgeSchema, matchId: 'MATCH-1', viewerId, revision, events };
}
function projection(value, id = 'P1', viewerKnowledge = null) {
  return projectRemainingDeckForViewer(value, { viewer: viewer(id), viewerKnowledge });
}
function countProjection(value, id = 'P1', viewerKnowledge = null) {
  return projectRemainingDeckCountForViewer(value, { viewer: viewer(id), viewerKnowledge });
}

test('authority snapshot canonicalizes counts but projection contract never exposes authority-only counts or order', () => {
  const input = ['SP-2', 'SP-1', 'SP-2', 'HT-1'];
  const before = [...input];
  const value = snapshot(input);
  assert.deepEqual(input, before);
  assert.deepEqual(value.cardCounts, [{ cardId: 'HT-1', count: 1 }, { cardId: 'SP-1', count: 1 }, { cardId: 'SP-2', count: 2 }]);
  assert.equal(value.total, 4);
  assert.equal('remainingCardIds' in value, false);
  assert.equal(validateAuthoritativeRemainingDeckSnapshot(value).ok, true);
  assert.equal(BATTLE_SELF_DECK_INSPECT_CORE.schema, 'GAMEROAD_BATTLE_SELF_DECK_INSPECT_V1');
  assert.equal(BATTLE_SELF_DECK_INSPECT_CORE.viewerKnowledgeSchema, 'GAMEROAD_BATTLE_REMAINING_DECK_VIEWER_KNOWLEDGE_V1');
  assert.equal(BATTLE_SELF_DECK_INSPECT_CORE.exposesAuthoritativeCardCounts, false);
  assert.equal(BATTLE_SELF_DECK_INSPECT_CORE.exposesDeckOrder, false);
  assert.equal(Object.isFrozen(value.cardCounts[0]), true);
});

test('count-only authority accepts live draw-pile size without secret identities or order', () => {
  const value = countSnapshot(4);
  assert.deepEqual(value, {
    schema: 'GAMEROAD_BATTLE_REMAINING_DECK_COUNT_V1',
    matchId: 'MATCH-1',
    ownerPlayerId: 'P1',
    revision: 7,
    total: 4
  });
  assert.equal(validateAuthoritativeRemainingDeckCountSnapshot(value).ok, true);
  assert.deepEqual(countProjection(value), projection(snapshot()));
  assert.equal('cardCounts' in value, false);
  assert.equal('remainingCardIds' in value, false);
  assert.equal(BATTLE_SELF_DECK_INSPECT_CORE.countOnlySchema, 'GAMEROAD_BATTLE_REMAINING_DECK_COUNT_V1');
  assert.equal(BATTLE_SELF_DECK_INSPECT_CORE.acceptsAuthoritativeCountOnly, true);
  assert.equal(BATTLE_SELF_DECK_INSPECT_CORE.exposesAuthoritativeCardCounts, false);
  assert.equal(BATTLE_SELF_DECK_INSPECT_CORE.exposesDeckOrder, false);
  assert.equal(Object.isFrozen(value), true);
});

test('count-only authority overlays only viewer-authorized known identities and leaves the rest unknown', () => {
  const value = countSnapshot(3, 9);
  const known = knowledge({ viewerId: 'P2', revision: 9, events: [event(20, 'RETURN_KNOWN', 'KNOWN-X')] });
  const projected = countProjection(value, 'P2', known);
  assert.deepEqual(projected.knownCardCounts, [{ cardId: 'KNOWN-X', count: 1 }]);
  assert.equal(projected.total, 3);
  assert.equal(projected.knownCount, 1);
  assert.equal(projected.unknownCount, 2);
  assert.equal(projected.knownTypeCount, 1);
  assert.equal('cardCounts' in projected, false);
  assert.equal('remainingCardIds' in projected, false);

  const tooManyKnown = countProjection(countSnapshot(1, 10), 'P1', knowledge({
    revision: 10,
    events: [event(0, 'INITIAL_KNOWN', 'A'), event(1, 'INITIAL_KNOWN', 'B')]
  }));
  assert.equal(tooManyKnown.ok, false);
  assert.equal(tooManyKnown.reason, 'VIEWER_KNOWN_COUNT_EXCEEDS_TOTAL');
});

test('count-only authority rejects invalid count and tampered secret-bearing shapes', () => {
  const valid = { matchId: 'M', ownerPlayerId: 'P1', revision: 0, remainingCount: 3 };
  assert.throws(() => createAuthoritativeRemainingDeckCountSnapshot({ ...valid, remainingCount: -1 }), /REMAINING_COUNT_INVALID/);
  assert.throws(() => createAuthoritativeRemainingDeckCountSnapshot({ ...valid, remainingCount: 1.5 }), /REMAINING_COUNT_INVALID/);
  assert.throws(() => createAuthoritativeRemainingDeckCountSnapshot({ ...valid, remainingCount: '3' }), /REMAINING_COUNT_INVALID/);
  const extraSecret = { ...countSnapshot(2), cardCounts: [{ cardId: 'SECRET', count: 2 }] };
  assert.equal(validateAuthoritativeRemainingDeckCountSnapshot(extraSecret).reason, 'COUNT_SNAPSHOT_SHAPE_INVALID');
  assert.equal(countProjection(extraSecret).reason, 'COUNT_SNAPSHOT_SHAPE_INVALID');
  const wrongSchema = { ...countSnapshot(2), schema: 'OTHER' };
  assert.equal(validateAuthoritativeRemainingDeckCountSnapshot(wrongSchema).reason, 'COUNT_SCHEMA_UNKNOWN');
});

test('ownership alone no longer reveals exact remaining identities', () => {
  for (const currentViewer of [viewer('P1'), viewer('P2'), viewer('SPECTATOR'), viewer('P1', false), null]) {
    const projected = projectRemainingDeckForViewer(snapshot(), { viewer: currentViewer });
    assert.equal(projected.ok, true);
    assert.equal(projected.total, 4);
    assert.equal('cardCounts' in projected, false);
    assert.equal('typeCount' in projected, false);
    assert.equal('knownCardCounts' in projected, false);
  }
});

test('self-known starting deck minus authorized known departures yields exact known remainder', () => {
  const value = snapshot(['SP-2', 'SP-1', 'HT-1'], 8);
  const known = knowledge({ revision: 8, events: [
    event(0, 'INITIAL_KNOWN', 'SP-2'), event(1, 'INITIAL_KNOWN', 'SP-1'), event(2, 'INITIAL_KNOWN', 'SP-2'),
    event(3, 'INITIAL_KNOWN', 'HT-1'), event(4, 'DEPART_KNOWN', 'SP-2')
  ] });
  const projected = projection(value, 'P1', known);
  assert.deepEqual(projected.knownCardCounts, [{ cardId: 'HT-1', count: 1 }, { cardId: 'SP-1', count: 1 }, { cardId: 'SP-2', count: 1 }]);
  assert.equal(projected.knownCount, 3);
  assert.equal(projected.unknownCount, 0);
  assert.equal(projected.knownTypeCount, 3);
  assert.equal('cardCounts' in projected, false);
});

test('partial public knowledge exposes only positively known cards and leaves the rest unknown', () => {
  const value = snapshot(['SECRET-A', 'KNOWN-X', 'SECRET-B'], 9);
  const projected = projection(value, 'P2', knowledge({ viewerId: 'P2', revision: 9, events: [event(20, 'RETURN_KNOWN', 'KNOWN-X')] }));
  assert.deepEqual(projected.knownCardCounts, [{ cardId: 'KNOWN-X', count: 1 }]);
  assert.equal(projected.knownCount, 1);
  assert.equal(projected.unknownCount, 2);
  assert.equal(projected.knownCardCounts.some(row => row.cardId.startsWith('SECRET-')), false);
});

test('known departures cannot invent unknown starting identities and known return/depart updates only known state', () => {
  const value = snapshot(['SECRET-A', 'SECRET-B'], 10);
  const unknownDeparture = projection(value, 'P2', knowledge({ viewerId: 'P2', revision: 10, events: [event(1, 'DEPART_KNOWN', 'REVEALED-DRAW')] }));
  assert.deepEqual(unknownDeparture.knownCardCounts, []);
  assert.equal(unknownDeparture.unknownCount, 2);
  const returnedThenDeparted = projection(value, 'P2', knowledge({ viewerId: 'P2', revision: 10, events: [event(2, 'RETURN_KNOWN', 'PUBLIC-X'), event(3, 'DEPART_KNOWN', 'PUBLIC-X')] }));
  assert.deepEqual(returnedThenDeparted.knownCardCounts, []);
  assert.equal(returnedThenDeparted.unknownCount, 2);
});

test('viewer knowledge fails closed on auth, identity, match, revision, kind, order, and initial-after-dynamic mismatches', () => {
  const value = snapshot();
  const base = knowledge({ events: [event(0, 'INITIAL_KNOWN', 'SP-2'), event(1, 'DEPART_KNOWN', 'SP-2')] });
  const cases = [
    [viewer('P1', false), base, 'VIEWER_AUTHENTICATION_REQUIRED'],
    [viewer('P2'), base, 'VIEWER_KNOWLEDGE_VIEWER_MISMATCH'],
    [viewer('P1'), { ...base, matchId: 'OTHER' }, 'VIEWER_KNOWLEDGE_MATCH_MISMATCH'],
    [viewer('P1'), { ...base, revision: 8 }, 'VIEWER_KNOWLEDGE_REVISION_MISMATCH'],
    [viewer('P1'), { ...base, events: [event(0, 'SECRET_PEEK', 'SP-2')] }, 'VIEWER_KNOWLEDGE_EVENT_KIND_INVALID'],
    [viewer('P1'), { ...base, events: [event(2, 'INITIAL_KNOWN', 'SP-2'), event(1, 'DEPART_KNOWN', 'SP-2')] }, 'VIEWER_KNOWLEDGE_EVENT_ORDER_INVALID'],
    [viewer('P1'), { ...base, events: [event(0, 'DEPART_KNOWN', 'SP-2'), event(1, 'INITIAL_KNOWN', 'SP-2')] }, 'VIEWER_KNOWLEDGE_INITIAL_AFTER_DYNAMIC']
  ];
  for (const [currentViewer, viewerKnowledge, reason] of cases) {
    const projected = projectRemainingDeckForViewer(value, { viewer: currentViewer, viewerKnowledge });
    assert.equal(projected.ok, false);
    assert.equal(projected.reason, reason);
    assert.equal('cardCounts' in projected, false);
    assert.equal('knownCardCounts' in projected, false);
  }
});

test('viewer knowledge cannot claim more positively known remaining cards than total deck size', () => {
  const value = snapshot(['A'], 12);
  const projected = projection(value, 'P1', knowledge({ revision: 12, events: [event(0, 'INITIAL_KNOWN', 'A'), event(1, 'INITIAL_KNOWN', 'B')] }));
  assert.equal(projected.ok, false);
  assert.equal(projected.reason, 'VIEWER_KNOWN_COUNT_EXCEEDS_TOTAL');
});

test('authority input validation and tamper detection remain fail-closed', () => {
  const valid = { matchId: 'M', ownerPlayerId: 'P1', revision: 0, remainingCardIds: [] };
  assert.throws(() => createAuthoritativeRemainingDeckSnapshot({ ...valid, matchId: '' }), /MATCH_ID_REQUIRED/);
  assert.throws(() => createAuthoritativeRemainingDeckSnapshot({ ...valid, ownerPlayerId: ' P1' }), /OWNER_PLAYER_ID_REQUIRED/);
  assert.throws(() => createAuthoritativeRemainingDeckSnapshot({ ...valid, revision: -1 }), /REVISION_INVALID/);
  assert.throws(() => createAuthoritativeRemainingDeckSnapshot({ ...valid, remainingCardIds: 'A' }), /REMAINING_CARD_IDS_REQUIRED/);
  assert.throws(() => createAuthoritativeRemainingDeckSnapshot({ ...valid, remainingCardIds: [' A'] }), /CARD_ID_INVALID/);
  const mutators = [
    raw => { raw.total = 999; }, raw => { raw.cardCounts[1].cardId = raw.cardCounts[0].cardId; }, raw => { raw.cardCounts.reverse(); },
    raw => { raw.cardCounts[0].count = 0; }, raw => { raw.remainingCardIds = ['SECRET-ORDER']; }
  ];
  for (const mutate of mutators) {
    const raw = JSON.parse(JSON.stringify(snapshot()));
    mutate(raw);
    assert.equal(validateAuthoritativeRemainingDeckSnapshot(raw).ok, false);
    const projected = projectRemainingDeckForViewer(raw, { viewer: viewer('P1') });
    assert.equal(projected.ok, false);
    assert.equal('cardCounts' in projected, false);
  }
});

test('shuffle/source order cannot affect public output and empty deck invents no identities', () => {
  const first = snapshot(['A', 'B', 'A', 'C', 'B']);
  const shuffled = snapshot(['B', 'A', 'B', 'C', 'A']);
  assert.deepEqual(first, shuffled);
  assert.deepEqual(projection(first), projection(shuffled));
  const empty = projection(snapshot([], 20));
  assert.equal(empty.total, 0);
  assert.equal('knownCardCounts' in empty, false);
});

test('knowledge projection is frozen, deterministic, and input-immutable', () => {
  const value = snapshot(['A', 'B'], 21);
  const known = knowledge({ revision: 21, events: [event(0, 'INITIAL_KNOWN', 'A')] });
  const beforeValue = JSON.stringify(value);
  const beforeKnown = JSON.stringify(known);
  const first = projection(value, 'P1', known);
  const second = projection(value, 'P1', known);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(value), beforeValue);
  assert.equal(JSON.stringify(known), beforeKnown);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.knownCardCounts), true);
  assert.equal(Object.isFrozen(first.knownCardCounts[0]), true);
});

test('replay may carry viewer-authorized known counts but never authority-only cardCounts', () => {
  const value = snapshot(['SP-2', 'SP-1', 'HT-1'], 22);
  const publicView = projectRemainingDeckForViewer(value, { viewer: viewer('SPECTATOR') });
  const ownerKnown = projection(value, 'P1', knowledge({ revision: 22, events: [
    event(0, 'INITIAL_KNOWN', 'SP-2'), event(1, 'INITIAL_KNOWN', 'SP-1'), event(2, 'INITIAL_KNOWN', 'SP-2'),
    event(3, 'INITIAL_KNOWN', 'HT-1'), event(4, 'DEPART_KNOWN', 'SP-2')
  ] }));
  let log = createReplayLog({ matchId: 'MATCH-1', versions });
  log = appendAcceptedEvent(log, {
    kind: 'remaining_deck_snapshot', publicData: publicView,
    privateByViewer: { P1: { knownCount: ownerKnown.knownCount, unknownCount: ownerKnown.unknownCount, knownTypeCount: ownerKnown.knownTypeCount, knownCardCounts: ownerKnown.knownCardCounts } },
    authorityOnly: value
  });
  const p1 = readReplay(log, { viewer: viewer('P1'), supportedVersions });
  const others = [
    readReplay(log, { viewer: viewer('P2'), supportedVersions }),
    readReplay(log, { viewer: { id: 'SPECTATOR', authenticated: true, phase: 'post_match' }, supportedVersions }),
    readReplay(log, { viewer: viewer('P1', false), supportedVersions })
  ];
  assert.deepEqual(p1.events[0].privateData.knownCardCounts, ownerKnown.knownCardCounts);
  assert.equal('cardCounts' in p1.events[0].privateData, false);
  for (const replay of others) assert.equal('privateData' in replay.events[0], false);
  for (const replay of [p1, ...others]) {
    assert.equal(replay.events[0].publicData.total, value.total);
    assert.equal('authorityOnly' in replay.events[0], false);
    assert.equal('privateByViewer' in replay.events[0], false);
    assert.equal('cardCounts' in replay.events[0].publicData, false);
    assert.equal('knownCardCounts' in replay.events[0].publicData, false);
  }
});
