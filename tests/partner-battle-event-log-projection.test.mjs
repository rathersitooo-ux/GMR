import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PARTNER_BATTLE_EVENT_PROJECTION,
  createPartnerBattleEventLogConsumerAdapter,
  projectPartnerBattleEventLog
} from '../browser/partner-battle-event-log-projection.mjs';
import {
  BATTLE_REPLAY_LIVE_ADAPTER,
  appendAcceptedBattleResolution,
  appendAcceptedMatchEnd,
  createLiveReplaySession,
  createPartnerBattleEventLogPresentationBridge,
  readLiveReplay
} from '../browser/battle-replay-live-adapter.mjs';

function replay(events) {
  return {
    ok: true,
    status: 'ready',
    schema: 'GAMEROAD_BATTLE_REPLAY_V1',
    matchId: 'match-evidence-1',
    versions: { rules: 'rule@7', content: 'cards:v4', state: 'runtime:v2' },
    events
  };
}

test('projects canonical battle resolution without player identity or privateData', () => {
  const result = projectPartnerBattleEventLog(replay([{
    sequence: 1,
    kind: 'battle_resolution',
    privateData: { secret: 'must-not-project' },
    publicData: {
      serial: 1,
      round: 3,
      mode: '2v2',
      attackerId: 'raw-user-a',
      defenderId: 'raw-user-b',
      lane: 'left',
      shield: 'shield-card-id',
      winnerIds: ['raw-user-a'],
      winningTeam: 'A',
      teamTotals: { A: 12, B: 9 },
      players: [
        { id: 'raw-user-a', name: 'Private Display Name', team: 'A', score: 12, winner: true, cards: [{ cardId: 'c1', label: 'ignored label', value: 5, origin: 'hand' }] },
        { id: 'raw-user-b', name: 'Other Name', team: 'B', score: 9, winner: false, cards: [{ cardId: 'c2', value: 4, origin: 'shield' }] }
      ],
      laneGains: [{ id: 'raw-user-a', lane: 'left', before: 2, after: 4, added: 2 }],
      maxLaneProgress: [{ id: 'raw-user-a', before: 2, after: 4 }]
    }
  }]));

  assert.equal(result.ok, true);
  assert.deepEqual(result.versions, { rules: 'rule@7', content: 'cards:v4', state: 'runtime:v2' });
  assert.equal(result.events[0].data.winnerCount, 1);
  assert.deepEqual(result.events[0].data.players[0], {
    team: 'A', score: 12, winner: true, cards: [{ cardId: 'c1', value: 5, origin: 'hand' }]
  });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('raw-user-a'), false);
  assert.equal(serialized.includes('raw-user-b'), false);
  assert.equal(serialized.includes('Private Display Name'), false);
  assert.equal(serialized.includes('must-not-project'), false);
});

test('projects match end without winner identity', () => {
  const result = projectPartnerBattleEventLog(replay([{
    sequence: 1,
    kind: 'match_ended',
    publicData: { winnerIds: ['u1', 'u2'], round: 6, mode: '2v2' }
  }]));
  assert.equal(result.ok, true);
  assert.deepEqual(result.events[0], {
    sequence: 1,
    kind: 'match_ended',
    data: { round: 6, mode: '2v2', winnerCount: 2 }
  });
  assert.equal(JSON.stringify(result).includes('u1'), false);
});

test('unknown canonical event kinds retain only sequence and kind', () => {
  const result = projectPartnerBattleEventLog(replay([{
    sequence: 1,
    kind: 'future_event',
    publicData: { userId: 'raw-user', arbitrary: 'do-not-copy' },
    privateData: { token: 'secret' }
  }]));
  assert.deepEqual(result.events[0], { sequence: 1, kind: 'future_event' });
});

test('fails closed for non-authoritative, malformed, or reordered inputs', () => {
  assert.deepEqual(projectPartnerBattleEventLog(null), { ok: false, reason: 'REPLAY_READ_INVALID' });
  assert.deepEqual(projectPartnerBattleEventLog({ ok: false, status: 'unavailable' }), { ok: false, reason: 'REPLAY_NOT_READY' });
  assert.deepEqual(projectPartnerBattleEventLog({ ...replay([]), schema: 'OTHER' }), { ok: false, reason: 'REPLAY_AUTHORITY_INVALID' });
  assert.deepEqual(projectPartnerBattleEventLog(replay([{ sequence: 2, kind: 'future_event' }])), { ok: false, reason: 'REPLAY_SEQUENCE_INVALID' });
});

test('projection contract declares no storage authority and preserves replay version authority', () => {
  assert.equal(PARTNER_BATTLE_EVENT_PROJECTION.storageAuthority, 'NONE');
  assert.equal(PARTNER_BATTLE_EVENT_PROJECTION.identityPolicy, 'DROP_PLAYER_IDS_AND_NAMES');
  assert.equal(PARTNER_BATTLE_EVENT_PROJECTION.privateDataPolicy, 'NEVER_PROJECT_PRIVATE_DATA');
  assert.equal(PARTNER_BATTLE_EVENT_PROJECTION.provenancePolicy, 'PRESERVE_EXACT_REPLAY_VERSIONS');
});

test('consumer adapter delivers exactly one frozen sanitized projection and no caller context', () => {
  const callerOnlyContext = { viewerId: 'raw-viewer-id', authToken: 'must-never-forward' };
  const delivered = [];
  const adapter = createPartnerBattleEventLogConsumerAdapter({
    readReplay: () => replay([{
      sequence: 1,
      kind: 'future_event',
      publicData: { viewerId: callerOnlyContext.viewerId, arbitrary: 'drop-this' },
      privateData: { authToken: callerOnlyContext.authToken }
    }]),
    consumeProjection(...args) {
      assert.equal(args.length, 1);
      delivered.push(args[0]);
    }
  });

  const result = adapter();

  assert.deepEqual(result, {
    ok: true,
    consumed: true,
    schema: 'GAMEROAD_PARTNER_BATTLE_EVENT_PROJECTION_V1',
    matchId: 'match-evidence-1',
    versions: { rules: 'rule@7', content: 'cards:v4', state: 'runtime:v2' },
    eventCount: 1
  });
  assert.equal(delivered.length, 1);
  assert.equal(Object.isFrozen(delivered[0]), true);
  assert.equal(Object.isFrozen(delivered[0].versions), true);
  assert.deepEqual(delivered[0].events[0], { sequence: 1, kind: 'future_event' });
  const serialized = JSON.stringify(delivered[0]);
  assert.equal(serialized.includes(callerOnlyContext.viewerId), false);
  assert.equal(serialized.includes(callerOnlyContext.authToken), false);
  assert.equal(serialized.includes('rulesVersion'), false);
  assert.equal(serialized.includes('cardVersion'), false);
  assert.equal(serialized.includes('stateVersion'), false);
});

test('consumer adapter never invokes consumer for invalid or unready replay authority', () => {
  let calls = 0;
  const invalid = createPartnerBattleEventLogConsumerAdapter({
    readReplay: () => null,
    consumeProjection: () => { calls += 1; }
  });
  const unready = createPartnerBattleEventLogConsumerAdapter({
    readReplay: () => ({ ok: false, status: 'unavailable' }),
    consumeProjection: () => { calls += 1; }
  });

  assert.deepEqual(invalid(), { ok: false, consumed: false, reason: 'REPLAY_READ_INVALID' });
  assert.deepEqual(unready(), { ok: false, consumed: false, reason: 'REPLAY_NOT_READY' });
  assert.equal(calls, 0);
});

test('consumer adapter fails closed when the viewer-authorized replay read throws', () => {
  let calls = 0;
  const adapter = createPartnerBattleEventLogConsumerAdapter({
    readReplay: () => { throw new Error('source unavailable'); },
    consumeProjection: () => { calls += 1; }
  });

  assert.deepEqual(adapter(), { ok: false, consumed: false, reason: 'REPLAY_READ_FAILED' });
  assert.equal(calls, 0);
});

test('consumer adapter fails closed when downstream consumer throws without exposing replay payload', () => {
  let captured = null;
  const adapter = createPartnerBattleEventLogConsumerAdapter({
    readReplay: () => replay([{ sequence: 1, kind: 'match_ended', publicData: { winnerIds: ['secret-user'], round: 6, mode: '2v2' } }]),
    consumeProjection: (projection) => {
      captured = projection;
      throw new Error('downstream unavailable');
    }
  });

  const result = adapter();
  assert.deepEqual(result, { ok: false, consumed: false, reason: 'PARTNER_CONSUMER_FAILED' });
  assert.equal(JSON.stringify(result).includes('secret-user'), false);
  assert.equal(JSON.stringify(captured).includes('secret-user'), false);
});

test('consumer adapter requires explicit read and consumer functions', () => {
  assert.throws(() => createPartnerBattleEventLogConsumerAdapter(), /readReplay must be a function/);
  assert.throws(
    () => createPartnerBattleEventLogConsumerAdapter({ readReplay: () => replay([]) }),
    /consumeProjection must be a function/
  );
});

const liveVersions = Object.freeze({
  rules: 'TEST_RULES_AUTHORITY',
  content: 'TEST_CONTENT_AUTHORITY',
  state: 'TEST_STATE_AUTHORITY'
});

function liveResolution(serial = 1) {
  return {
    serial,
    round: serial,
    mode: '2v2',
    attackerId: 'P1',
    defenderId: 'P3',
    lane: 'C',
    shield: 'C',
    winnerIds: ['P1', 'P2'],
    winningTeam: 'A',
    teamTotals: { A: 21, B: 18 },
    players: [
      {
        id: 'P1',
        name: 'You',
        team: 'A',
        score: 11,
        winner: true,
        cards: [{
          cardId: 'C1',
          label: '公開札1',
          value: 6,
          origin: 'active_submission',
          hiddenDeckOrder: ['SECRET_ORDER']
        }],
        hand: ['SECRET_HAND']
      },
      {
        id: 'P3',
        name: 'CPU',
        team: 'B',
        score: 9,
        winner: false,
        cards: [{ cardId: 'C2', label: '公開札2', value: 4, origin: 'active_submission' }]
      }
    ],
    laneGains: [{ id: 'P1', lane: 'C', before: 2, after: 4, added: 2 }],
    maxLaneProgress: [{ id: 'P1', before: 2, after: 4 }],
    secretFutureState: { opponentHand: ['SECRET_FUTURE'] }
  };
}

function fakeBattleLogDocument() {
  const children = [];
  const shell = {
    children,
    querySelector(selector) {
      if (selector !== '[data-partner-battle-event-log]') return null;
      return children.find(child => Object.prototype.hasOwnProperty.call(child.attributes, 'data-partner-battle-event-log')) || null;
    },
    appendChild(node) {
      children.push(node);
      return node;
    }
  };
  const document = {
    getElementById(id) {
      return id === 'battleLog' ? shell : null;
    },
    createElement(tag) {
      return {
        tagName: String(tag).toUpperCase(),
        attributes: {},
        dataset: {},
        style: {},
        textContent: '',
        setAttribute(name, value) {
          this.attributes[name] = String(value);
        },
        getAttribute(name) {
          return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
        }
      };
    }
  };
  return { document, shell, children };
}

test('current live replay feeds the existing Battle log surface through the sanitized Partner projection', () => {
  const fake = fakeBattleLogDocument();
  const partnerBridge = createPartnerBattleEventLogPresentationBridge({ document: fake.document });
  let session = createLiveReplaySession(
    { matchId: 'M-PARTNER-LOG', versions: liveVersions },
    { partnerBattleEventLogBridge: partnerBridge }
  );
  session = appendAcceptedBattleResolution(
    session,
    liveResolution(1),
    { partnerBattleEventLogBridge: partnerBridge }
  );

  assert.equal(fake.children.length, 1);
  const host = fake.children[0];
  assert.equal(host.getAttribute('role'), 'log');
  assert.equal(host.getAttribute('aria-live'), 'polite');
  assert.equal(host.getAttribute('aria-atomic'), 'false');
  assert.equal(host.getAttribute('aria-relevant'), 'additions text');
  assert.equal(host.getAttribute('aria-label'), '対戦ログ');
  assert.equal(host.dataset.partnerBattleEventCount, '1');
  assert.match(host.textContent, /第1ラウンド/);
  assert.match(host.textContent, /C列/);
  assert.match(host.textContent, /A 21 \/ B 18/);
  assert.match(host.textContent, /勝者2人/);

  const serialized = host.textContent;
  for (const secret of [
    'P1', 'P3', 'You', 'CPU', 'C1', 'C2',
    'SECRET_ORDER', 'SECRET_HAND', 'SECRET_FUTURE'
  ]) {
    assert.equal(serialized.includes(secret), false, `Battle log must not expose ${secret}`);
  }

  session = appendAcceptedMatchEnd(
    session,
    { winnerIds: ['P1', 'P2'], round: 1, mode: '2v2' },
    { partnerBattleEventLogBridge: partnerBridge }
  );
  assert.equal(host.dataset.partnerBattleEventCount, '2');
  assert.match(host.textContent, /対戦終了・第1ラウンド・勝者2人/);
  assert.equal(readLiveReplay(session).events.length, 2);
});

test('Partner Battle log rendering is fail-soft and cannot roll back accepted replay truth', () => {
  const unavailableBridge = createPartnerBattleEventLogPresentationBridge({ document: null });
  let session = createLiveReplaySession(
    { matchId: 'M-PARTNER-FAILSOFT', versions: liveVersions },
    { partnerBattleEventLogBridge: unavailableBridge }
  );
  session = appendAcceptedBattleResolution(
    session,
    liveResolution(1),
    { partnerBattleEventLogBridge: unavailableBridge }
  );
  const replayResult = readLiveReplay(session);
  assert.equal(replayResult.ok, true);
  assert.equal(replayResult.events.length, 1);
  assert.equal(replayResult.events[0].kind, 'battle_resolution');
});

test('live adapter declares Partner log as presentation-only use of the existing Battle log surface', () => {
  assert.deepEqual(BATTLE_REPLAY_LIVE_ADAPTER.partnerBattleEventLog, {
    source: 'viewer_authorized_public_replay_read',
    projectionSchema: 'GAMEROAD_PARTNER_BATTLE_EVENT_PROJECTION_V1',
    actualDomSurface: 'battleLog',
    identityPolicy: 'DROP_PLAYER_IDS_AND_NAMES',
    privateDataPolicy: 'NEVER_PROJECT_PRIVATE_DATA',
    authority: 'presentation_only_no_game_state_write'
  });
});
