import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSpectatorPlayer,
  isSpectatorProjection,
  isSpectatorViewer,
  normalizeSpectatorViewer,
  spectatorReplayEventsFromProjection
} from '../browser/room-match-spectator-projection-core.mjs';

test('spectator viewer is never authenticated as a player', () => {
  const viewer = normalizeSpectatorViewer();
  assert.equal(viewer.authenticated, false);
  assert.equal(viewer.id, null);
  assert.equal(viewer.viewerRole, 'spectator');
  assert.equal(isSpectatorViewer(viewer), true);
  assert.equal(isSpectatorViewer({ authenticated: true, id: 'P1', viewerRole: 'spectator' }), false);
  assert.equal(isSpectatorViewer(null), false);
});

test('spectator player hides hand, deck, shields, janken and plan', () => {
  const player = buildSpectatorPlayer({
    id: 'P1',
    name: 'P1',
    character: 'naki',
    team: 'A',
    position: 'K:NE',
    manaCurrent: 7,
    manaMax: 10,
    honey: 3,
    chip: ['a', 'b'],
    lanes: { L: ['x', 'y'], C: [], R: [] },
    deck: ['d1', 'd2', 'd3'],
    hand: ['h1', 'h2'],
    shields: { L: 's1', C: 's2', R: 's3' },
    jankenAssignment: { assignmentEpochId: 'e1' },
    plan: { roadId: 'r1', battleId: 'b1' },
    nextCostReduction: 1,
    battleBlockedRound: 0,
    sourceDeckSize: 40
  });
  assert.equal(player.human, false);
  assert.deepEqual(player.hand, []);
  assert.deepEqual(player.deck, ['__HIDDEN__', '__HIDDEN__', '__HIDDEN__']);
  assert.deepEqual(player.shields, { L: '__HIDDEN__', C: '__HIDDEN__', R: '__HIDDEN__' });
  assert.equal(player.plan, null);
  assert.equal('jankenAssignment' in player, false);
  assert.deepEqual(player.lanes, { L: ['x', 'y'], C: [], R: [] });
  assert.equal(player.manaCurrent, 7);
  assert.equal(player.honey, 3);
  assert.deepEqual(player.chip, ['__PUBLIC_COUNT__', '__PUBLIC_COUNT__']);
});

test('spectator player needs an id', () => {
  assert.throws(() => buildSpectatorPlayer(null), /SPECTATOR_PLAYER/);
  assert.throws(() => buildSpectatorPlayer({}), /SPECTATOR_PLAYER/);
});

test('spectator projection is recognized by its viewer role', () => {
  assert.equal(isSpectatorProjection({ viewerRole: 'spectator' }), true);
  assert.equal(isSpectatorProjection({ viewerRole: 'player' }), false);
  assert.equal(isSpectatorProjection(null), false);
});

test('only public replay events pass through to a spectator', () => {
  const projection = {
    replayEvents: [
      { kind: 'battle_resolution', publicData: { round: 1 } },
      { kind: 'match_ended', publicData: { round: 2 } },
      { kind: 'battle_resolution', publicData: { round: 3 }, privateData: { hand: ['x'] } },
      { kind: 'battle_resolution', privateByViewer: { P1: {} } },
      { kind: '', publicData: {} },
      null
    ]
  };
  const events = spectatorReplayEventsFromProjection(projection);
  assert.equal(events.length, 2);
  assert.equal(events[0].kind, 'battle_resolution');
  assert.equal(events[1].kind, 'match_ended');
  assert.equal(spectatorReplayEventsFromProjection(null).length, 0);
  assert.equal(spectatorReplayEventsFromProjection({}).length, 0);
});
