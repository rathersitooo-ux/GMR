import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_SELF_DECK_INSPECT_CORE,
  createAuthoritativeRemainingDeckSnapshot,
  projectRemainingDeckForViewer,
  validateAuthoritativeRemainingDeckSnapshot
} from '../browser/battle-self-deck-inspect-core.mjs';
import {
  appendAcceptedEvent,
  createReplayLog,
  readReplay
} from '../browser/battle-replay-core.mjs';

const versions = Object.freeze({ rules: 'rules-r1', content: 'content-r1', state: 'state-r1' });
const supportedVersions = Object.freeze({ rules: ['rules-r1'], content: ['content-r1'], state: ['state-r1'] });

function snapshot(ids = ['SP-2', 'SP-1', 'SP-2', 'HT-1'], revision = 7) {
  return createAuthoritativeRemainingDeckSnapshot({ matchId: 'MATCH-1', ownerPlayerId: 'P1', revision, remainingCardIds: ids });
}
function publicProjection(value) { return projectRemainingDeckForViewer(value, { viewer: { id: 'SPECTATOR', authenticated: true } }); }
function ownerProjection(value) { return projectRemainingDeckForViewer(value, { viewer: { id: 'P1', authenticated: true } }); }

test('authoritative creation discards order and canonicalizes type counts', () => {
  const input = ['SP-2', 'SP-1', 'SP-2', 'HT-1']; const before = [...input]; const value = snapshot(input);
  assert.equal(BATTLE_SELF_DECK_INSPECT_CORE.schema, 'GAMEROAD_BATTLE_SELF_DECK_INSPECT_V1');
  assert.deepEqual(input, before); assert.equal(value.total, 4);
  assert.deepEqual(value.cardCounts, [{ cardId: 'HT-1', count: 1 }, { cardId: 'SP-1', count: 1 }, { cardId: 'SP-2', count: 2 }]);
  assert.equal('remainingCardIds' in value, false); assert.equal(validateAuthoritativeRemainingDeckSnapshot(value).ok, true);
  assert.equal(Object.isFrozen(value), true); assert.equal(Object.isFrozen(value.cardCounts), true); assert.equal(Object.isFrozen(value.cardCounts[0]), true);
});

test('authenticated owner receives type counts while public identity and total remain stable', () => {
  const value = ownerProjection(snapshot()); assert.equal(value.ok, true); assert.equal(value.matchId, 'MATCH-1'); assert.equal(value.ownerPlayerId, 'P1');
  assert.equal(value.revision, 7); assert.equal(value.total, 4); assert.equal(value.typeCount, 3);
  assert.deepEqual(value.cardCounts, [{ cardId: 'HT-1', count: 1 }, { cardId: 'SP-1', count: 1 }, { cardId: 'SP-2', count: 2 }]);
});

test('opponent, spectator, and unauthenticated spoof receive public total only', () => {
  const value = snapshot(); const viewers = [{ id: 'P2', authenticated: true }, { id: 'SPECTATOR', authenticated: true }, { id: 'P1', authenticated: false }, null];
  for (const viewer of viewers) { const projected = projectRemainingDeckForViewer(value, { viewer }); assert.equal(projected.ok, true); assert.equal(projected.total, 4); assert.equal(projected.revision, 7); assert.equal('cardCounts' in projected, false); assert.equal('typeCount' in projected, false); }
});

test('shuffle and source order cannot change canonical owner counts', () => {
  const first = snapshot(['A', 'B', 'A', 'C', 'B']); const shuffled = snapshot(['B', 'A', 'B', 'C', 'A']); assert.deepEqual(first, shuffled); assert.deepEqual(ownerProjection(first).cardCounts, ownerProjection(shuffled).cardCounts);
});

test('draw and return are represented only by new authoritative snapshots', () => {
  const before = snapshot(['A', 'A', 'B'], 10); const afterDraw = snapshot(['A', 'B'], 11); const afterReturn = snapshot(['B', 'A', 'A'], 12);
  assert.deepEqual(ownerProjection(before).cardCounts, [{ cardId: 'A', count: 2 }, { cardId: 'B', count: 1 }]);
  assert.deepEqual(ownerProjection(afterDraw).cardCounts, [{ cardId: 'A', count: 1 }, { cardId: 'B', count: 1 }]);
  assert.deepEqual(ownerProjection(afterReturn).cardCounts, [{ cardId: 'A', count: 2 }, { cardId: 'B', count: 1 }]);
  assert.deepEqual(publicProjection(afterDraw), { ok: true, status: 'ready', schema: 'GAMEROAD_BATTLE_SELF_DECK_INSPECT_V1', matchId: 'MATCH-1', ownerPlayerId: 'P1', revision: 11, total: 2 });
});

test('empty remaining deck is valid without inventing card identities', () => { const value = snapshot([], 20); assert.deepEqual(ownerProjection(value).cardCounts, []); assert.equal(ownerProjection(value).typeCount, 0); assert.equal(publicProjection(value).total, 0); });

test('creation fails closed on malformed authority inputs', () => {
  const valid = { matchId: 'M', ownerPlayerId: 'P1', revision: 0, remainingCardIds: [] };
  assert.throws(() => createAuthoritativeRemainingDeckSnapshot({ ...valid, matchId: '' }), /MATCH_ID_REQUIRED/);
  assert.throws(() => createAuthoritativeRemainingDeckSnapshot({ ...valid, ownerPlayerId: ' P1' }), /OWNER_PLAYER_ID_REQUIRED/);
  assert.throws(() => createAuthoritativeRemainingDeckSnapshot({ ...valid, revision: -1 }), /REVISION_INVALID/);
  assert.throws(() => createAuthoritativeRemainingDeckSnapshot({ ...valid, remainingCardIds: 'A' }), /REMAINING_CARD_IDS_REQUIRED/);
  assert.throws(() => createAuthoritativeRemainingDeckSnapshot({ ...valid, remainingCardIds: [' A'] }), /CARD_ID_INVALID/);
});

test('tampered or order-bearing snapshots fail closed instead of leaking data', () => {
  const cases = [raw => { raw.total = 999; }, raw => { raw.cardCounts[1].cardId = raw.cardCounts[0].cardId; }, raw => { raw.cardCounts.reverse(); }, raw => { raw.cardCounts[0].count = 0; }, raw => { raw.remainingCardIds = ['SECRET-ORDER']; }];
  for (const mutate of cases) { const raw = JSON.parse(JSON.stringify(snapshot())); mutate(raw); const validation = validateAuthoritativeRemainingDeckSnapshot(raw); assert.equal(validation.ok, false); const projected = projectRemainingDeckForViewer(raw, { viewer: { id: 'P1', authenticated: true } }); assert.equal(projected.ok, false); assert.equal('cardCounts' in projected, false); }
});

test('projection is frozen, deterministic, and does not mutate the authoritative snapshot', () => {
  const value = snapshot(); const before = JSON.stringify(value); const first = ownerProjection(value); const second = ownerProjection(value); assert.deepEqual(first, second); assert.equal(JSON.stringify(value), before); assert.equal(Object.isFrozen(first), true); assert.equal(Object.isFrozen(first.cardCounts), true); assert.equal(Object.isFrozen(first.cardCounts[0]), true);
});

test('replay composition preserves the same viewer boundary and never exposes authority-only counts', () => {
  const value = snapshot(); const owner = ownerProjection(value); const publicView = publicProjection(value);
  let log = createReplayLog({ matchId: 'MATCH-1', versions });
  log = appendAcceptedEvent(log, { kind: 'remaining_deck_snapshot', publicData: publicView, privateByViewer: { P1: { typeCount: owner.typeCount, cardCounts: owner.cardCounts } }, authorityOnly: value });
  const p1 = readReplay(log, { viewer: { id: 'P1', authenticated: true }, supportedVersions });
  const opponent = readReplay(log, { viewer: { id: 'P2', authenticated: true }, supportedVersions });
  const spectator = readReplay(log, { viewer: { id: 'SPECTATOR', authenticated: true, phase: 'post_match' }, supportedVersions });
  const spoofed = readReplay(log, { viewer: { id: 'P1', authenticated: false }, supportedVersions });
  assert.deepEqual(p1.events[0].privateData.cardCounts, owner.cardCounts);
  for (const replay of [opponent, spectator, spoofed]) assert.equal('privateData' in replay.events[0], false);
  for (const replay of [p1, opponent, spectator, spoofed]) { assert.equal(replay.events[0].publicData.total, value.total); assert.equal('authorityOnly' in replay.events[0], false); assert.equal('privateByViewer' in replay.events[0], false); assert.equal('cardCounts' in replay.events[0].publicData, false); }
});
