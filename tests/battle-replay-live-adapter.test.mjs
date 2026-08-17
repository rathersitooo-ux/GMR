import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BATTLE_REPLAY_LIVE_ADAPTER,
  appendAcceptedBattleResolution,
  appendAcceptedMatchEnd,
  battleReplayContentVersion,
  battleReplayRulesVersion,
  createBattleReplayVersionAuthority,
  createLiveReplaySession,
  projectAcceptedBattleResolution,
  readLiveReplay
} from '../browser/battle-replay-live-adapter.mjs';

const versions = Object.freeze({
  rules: 'TEST_RULES_AUTHORITY',
  content: 'TEST_CONTENT_AUTHORITY',
  state: 'TEST_STATE_AUTHORITY'
});

function resolution(serial = 1) {
  return {
    serial,
    round: serial,
    mode: '2v2',
    attackerId: 'P1',
    defenderId: 'P3',
    lane: 'C',
    shield: 1,
    winnerIds: ['P1', 'P2'],
    winningTeam: 'A',
    teamTotals: { A: 21, B: 18 },
    players: [
      {
        id: 'P1', name: 'You', team: 'A', score: 11, winner: true,
        cards: [{ cardId: 'C1', label: '公開札1', value: 6, origin: 'active_submission', hiddenDeckOrder: ['NO'] }],
        hand: ['SECRET_HAND']
      },
      {
        id: 'P3', name: 'CPU', team: 'B', score: 9, winner: false,
        cards: [{ cardId: 'C2', label: '公開札2', value: 4, origin: 'active_submission' }]
      }
    ],
    laneGains: [{ id: 'P1', lane: 'C', before: 2, after: 4, added: 2 }],
    maxLaneProgress: [{ id: 'P1', before: 2, after: 4 }],
    secretFutureState: { opponentHand: ['NO'] }
  };
}

test('production session still requires all exact version authorities; capture never invents them', () => {
  for (const missing of ['rules', 'content', 'state']) {
    const bad = { ...versions };
    delete bad[missing];
    assert.throws(
      () => createLiveReplaySession({ matchId: 'M1', versions: bad }),
      new RegExp(`VERSION_REQUIRED:${missing}`)
    );
  }
});

test('version authority derives rules only from current DECK_RULE identity and revision', () => {
  assert.equal(
    battleReplayRulesVersion({ id: 'FIRST_REGULATION', revision: 3 }),
    'FIRST_REGULATION@3'
  );
  assert.throws(
    () => battleReplayRulesVersion({ id: 'FIRST_REGULATION', revision: 0 }),
    /DECK_RULE_AUTHORITY_INVALID/
  );
});

test('content version is deterministic over canonical card content and changes when content changes', () => {
  const left = [{ id: 'A', power: 3, nested: { b: 2, a: 1 } }];
  const reordered = [{ nested: { a: 1, b: 2 }, power: 3, id: 'A' }];
  const changed = [{ id: 'A', power: 4, nested: { a: 1, b: 2 } }];
  assert.equal(battleReplayContentVersion(left), battleReplayContentVersion(reordered));
  assert.notEqual(battleReplayContentVersion(left), battleReplayContentVersion(changed));
});

test('version bundle reuses live adapter schema as state authority instead of creating a second state schema', () => {
  const authority = createBattleReplayVersionAuthority({
    deckRule: { id: 'FIRST_REGULATION', revision: 3 },
    cardData: [{ id: 'A', power: 3 }]
  });
  assert.equal(authority.rules, 'FIRST_REGULATION@3');
  assert.match(authority.content, /^GAMEROAD_CARD_CONTENT_FNV1A64:1:[0-9a-f]{16}$/);
  assert.equal(authority.state, BATTLE_REPLAY_LIVE_ADAPTER.schema);
  assert.deepEqual(BATTLE_REPLAY_LIVE_ADAPTER.versionAuthoritySources, {
    rules: 'DECK_RULE.id+revision',
    content: 'window.__CARD_DATA__ canonical JSON fingerprint',
    state: 'LIVE_ADAPTER_SCHEMA'
  });
});

test('accepted battle projection is a strict public allowlist and strips unrelated secret fields', () => {
  const input = resolution();
  const before = JSON.stringify(input);
  const projected = projectAcceptedBattleResolution(input);
  assert.equal(JSON.stringify(input), before);
  assert.equal(Object.isFrozen(projected), true);
  assert.deepEqual(Object.keys(projected).sort(), [
    'attackerId', 'defenderId', 'lane', 'laneGains', 'maxLaneProgress', 'mode',
    'players', 'round', 'serial', 'shield', 'teamTotals', 'winnerIds', 'winningTeam'
  ].sort());
  assert.equal('secretFutureState' in projected, false);
  assert.equal('hand' in projected.players[0], false);
  assert.equal('hiddenDeckOrder' in projected.players[0].cards[0], false);
});

test('resolution serial is enforced as the accepted Battle order and gap/reorder fails closed', () => {
  const first = appendAcceptedBattleResolution(
    createLiveReplaySession({ matchId: 'M1', versions }),
    resolution(1)
  );
  assert.equal(first.lastResolutionSerial, 1);
  assert.equal(first.log.events[0].sequence, 1);
  assert.throws(
    () => appendAcceptedBattleResolution(first, resolution(3)),
    /RESOLUTION_SERIAL_GAP_OR_REORDER/
  );
  assert.throws(
    () => appendAcceptedBattleResolution(first, resolution(1)),
    /RESOLUTION_SERIAL_GAP_OR_REORDER/
  );
});

test('viewer replay exposes only public accepted resolution and public match end', () => {
  let session = createLiveReplaySession({ matchId: 'M1', versions });
  session = appendAcceptedBattleResolution(session, resolution(1));
  session = appendAcceptedMatchEnd(session, {
    winnerIds: ['P1', 'P2'],
    round: 1,
    mode: '2v2'
  });
  const replay = readLiveReplay(session, {
    viewer: { id: 'P1', authenticated: true }
  });
  assert.equal(replay.ok, true);
  assert.deepEqual(replay.events.map(event => event.kind), ['battle_resolution', 'match_ended']);
  assert.equal('privateData' in replay.events[0], false);
  assert.equal('privateByViewer' in replay.events[0], false);
  assert.equal('authorityOnly' in replay.events[0], false);
  assert.equal(replay.events[0].publicData.players[0].cards[0].cardId, 'C1');
});

test('replay capture is immutable and cannot mutate accepted Battle inputs', () => {
  const input = resolution(1);
  const before = JSON.stringify(input);
  const initial = createLiveReplaySession({ matchId: 'M1', versions });
  const next = appendAcceptedBattleResolution(initial, input);
  assert.equal(JSON.stringify(input), before);
  assert.equal(initial.log.events.length, 0);
  assert.equal(next.log.events.length, 1);
  assert.equal(Object.isFrozen(next), true);
  assert.equal(Object.isFrozen(next.log), true);
});

test('rematch uses a new isolated session and never carries prior replay events', () => {
  let first = createLiveReplaySession({ matchId: 'M1', versions });
  first = appendAcceptedBattleResolution(first, resolution(1));
  first = appendAcceptedMatchEnd(first, { winnerIds: ['P1', 'P2'], round: 1, mode: '2v2' });

  const second = createLiveReplaySession({ matchId: 'M2', versions });
  assert.equal(readLiveReplay(first).events.length, 2);
  assert.equal(readLiveReplay(second).events.length, 0);
  assert.equal(second.matchId, 'M2');
  assert.equal(second.lastResolutionSerial, 0);
  assert.equal(second.ended, false);
});


test('production Browser mounts replay at the canonical accepted Battle seam without a guest-side second capture path', () => {
  const html = readFileSync(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');
  const count = (needle) => html.split(needle).length - 1;
  assert.equal(count("import('./battle-replay-live-adapter.mjs')"), 1);
  assert.equal(count('grBattleReplayBegin(state.match)'), 1);
  assert.equal(count('grBattleReplayAcceptResolution(m,m.lastBattleResolution)'), 1);
  assert.equal(count('grBattleReplayEnd(m,winners);return endMatch(winners)'), 1);
  assert.equal(count('id="resultReplay"'), 1);
  assert.equal(count('id="resultReplayEvents"'), 1);
  assert.ok(html.indexOf('m.lastBattleResolution={serial:++m.resolutionSeq') < html.indexOf('grBattleReplayAcceptResolution(m,m.lastBattleResolution)'));
  assert.ok(html.indexOf('grBattleReplayAcceptResolution(m,m.lastBattleResolution)') < html.indexOf('const slaykiaAttackEnd=grSlaykiaAttackEndHook(m)'));
  assert.ok(html.indexOf('grBattleReplayEnd(m,winners);return endMatch(winners)') < html.indexOf('return endMatch(winners)}nextRound()'));
  assert.match(html, /createBattleReplayVersionAuthority\(\{deckRule:DECK_RULE,cardData:window\.__CARD_DATA__\}\)/);
  assert.match(html, /appendAcceptedBattleResolution\(session,resolution\)/);
  assert.match(html, /appendAcceptedMatchEnd\(session,\{winnerIds:\[\.\.\.winners\],round:m\.round,mode:m\.mode\}\)/);
});
