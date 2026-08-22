import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPartnerBattleEventLogLiveMount,
  formatPartnerBattleEventLogProjection,
  renderPartnerBattleEventLogProjection
} from '../browser/partner-battle-event-log-live-mount.mjs';
import {
  appendAcceptedBattleResolution,
  appendAcceptedMatchEnd,
  createLiveReplaySession,
  readLiveReplay
} from '../browser/battle-replay-live-adapter.mjs';

function replayRead() {
  return {
    ok: true,
    status: 'ready',
    schema: 'GAMEROAD_BATTLE_REPLAY_V1',
    matchId: 'secret-match-id',
    versions: { rules: 'rules@1', content: 'content@1', state: 'state@1' },
    events: [
      {
        sequence: 1,
        kind: 'battle_resolution',
        publicData: {
          serial: 1,
          round: 1,
          mode: '4p',
          attackerId: 'PLAYER_SECRET_A',
          defenderId: 'PLAYER_SECRET_B',
          lane: 'CENTER',
          shield: 'shield-card',
          winnerIds: ['PLAYER_SECRET_A'],
          players: [
            { id: 'PLAYER_SECRET_A', name: 'Alice Secret', team: 'A', score: 8, winner: true, cards: [{ cardId: 'CARD_PUBLIC_1', label: 'Private Label', value: 8, origin: 'hand' }] },
            { id: 'PLAYER_SECRET_B', name: 'Bob Secret', team: 'B', score: 5, winner: false, cards: [{ cardId: 'CARD_PUBLIC_2', label: 'Other Label', value: 5, origin: 'hand' }] }
          ],
          laneGains: [
            { id: 'PLAYER_SECRET_A', lane: 'CENTER', before: 2, after: 4, added: 2 },
            { id: 'PLAYER_SECRET_B', lane: 'LEFT', before: 1, after: 1, added: 0 }
          ],
          maxLaneProgress: [
            { id: 'PLAYER_SECRET_A', before: 2, after: 4 },
            { id: 'PLAYER_SECRET_B', before: 1, after: 1 }
          ]
        }
      },
      {
        sequence: 2,
        kind: 'match_ended',
        publicData: { round: 1, mode: '4p', winnerIds: ['PLAYER_SECRET_A'] }
      }
    ]
  };
}

function acceptedResolution() {
  return {
    serial: 1,
    round: 1,
    mode: '2p',
    attackerId: 'p1',
    defenderId: 'p2',
    lane: 'CENTER',
    shield: null,
    winnerIds: ['p1'],
    winningTeam: 'A',
    teamTotals: { A: 8, B: 5 },
    players: [
      { id: 'p1', name: 'P1', team: 'A', score: 8, winner: true, cards: [{ cardId: 'c1', label: 'C1', value: 8, origin: 'hand' }] },
      { id: 'p2', name: 'P2', team: 'B', score: 5, winner: false, cards: [{ cardId: 'c2', label: 'C2', value: 5, origin: 'hand' }] }
    ],
    laneGains: [
      { id: 'p1', lane: 'CENTER', before: 0, after: 1, added: 1 },
      { id: 'p2', lane: 'LEFT', before: 0, after: 0, added: 0 }
    ],
    maxLaneProgress: [
      { id: 'p1', before: 0, after: 1 },
      { id: 'p2', before: 0, after: 0 }
    ]
  };
}

function fakeDocument() {
  const host = {
    existingText: 'existing battle log content',
    children: [],
    querySelector(selector) {
      if (selector !== '[data-partner-battle-event-log="1"]') return null;
      return this.children.find(child => child.dataset?.partnerBattleEventLog === '1') || null;
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    }
  };
  return {
    host,
    document: {
      getElementById(id) { return id === 'battleLog' ? host : null; },
      createElement() {
        return {
          dataset: {},
          style: {},
          attributes: {},
          textContent: '',
          setAttribute(name, value) { this.attributes[name] = value; }
        };
      }
    }
  };
}

test('live mount renders only sanitized factual Partner replay projection into dedicated battleLog child', () => {
  const dom = fakeDocument();
  let sessionSeen = null;
  const mount = createPartnerBattleEventLogLiveMount({
    readReplay(session) {
      sessionSeen = session;
      return replayRead();
    },
    environment: { document: dom.document }
  });

  const session = { schema: 'TEST_SESSION', token: 'do-not-render' };
  const result = mount.sync(session);
  assert.equal(result.ok, true);
  assert.equal(result.consumed, true);
  assert.equal(result.rendered, true);
  assert.equal(sessionSeen, session);
  assert.equal(dom.host.existingText, 'existing battle log content');
  assert.equal(dom.host.children.length, 1);

  const target = dom.host.children[0];
  assert.equal(target.dataset.partnerBattleEventLog, '1');
  assert.equal(target.dataset.partnerBattleEventLogCount, '2');
  assert.equal(target.attributes.role, 'log');
  assert.equal(target.textContent, 'R1 / CENTER / 勝者1 / 進行+2\n終了 R1 / 勝者1');

  for (const secret of ['PLAYER_SECRET_A', 'PLAYER_SECRET_B', 'Alice Secret', 'Bob Secret', 'secret-match-id', 'Private Label', 'do-not-render']) {
    assert.equal(target.textContent.includes(secret), false, `must not render identity/private source: ${secret}`);
  }
});

test('accepted replay production callsite syncs Partner log after resolution and match end', () => {
  const synced = [];
  const partnerBattleEventLogMount = { sync(session) { synced.push(session); } };
  let session = createLiveReplaySession({
    matchId: 'm-callsite',
    versions: { rules: 'rules@1', content: 'content@1', state: 'state@1' }
  }, { presentationBridge: null });

  session = appendAcceptedBattleResolution(session, acceptedResolution(), {
    presentationBridge: null,
    partnerBattleEventLogMount
  });
  assert.equal(synced.length, 1);
  assert.equal(synced[0], session);
  assert.equal(readLiveReplay(session).events.length, 1);

  session = appendAcceptedMatchEnd(session, {
    winnerIds: ['p1'],
    round: 1,
    mode: '2p'
  }, {
    presentationBridge: null,
    partnerBattleEventLogMount
  });
  assert.equal(synced.length, 2);
  assert.equal(synced[1], session);
  assert.equal(readLiveReplay(session).events.length, 2);
});

test('Partner live sync failure cannot roll back accepted replay state', () => {
  const throwingMount = { sync() { throw new Error('presentation unavailable'); } };
  const session = createLiveReplaySession({
    matchId: 'm-fail-soft',
    versions: { rules: 'rules@1', content: 'content@1', state: 'state@1' }
  }, { presentationBridge: null });
  const next = appendAcceptedBattleResolution(session, acceptedResolution(), {
    presentationBridge: null,
    partnerBattleEventLogMount: throwingMount
  });
  const replay = readLiveReplay(next);
  assert.equal(replay.ok, true);
  assert.equal(replay.events.length, 1);
});

test('live mount updates the same dedicated child and remains fail-soft when DOM is unavailable', () => {
  const dom = fakeDocument();
  const mount = createPartnerBattleEventLogLiveMount({
    readReplay: () => replayRead(),
    environment: { document: dom.document }
  });
  assert.equal(mount.sync({ serial: 1 }).rendered, true);
  assert.equal(mount.sync({ serial: 2 }).rendered, true);
  assert.equal(dom.host.children.length, 1);
  assert.equal(mount.snapshot().eventCount, 2);

  const noDomMount = createPartnerBattleEventLogLiveMount({
    readReplay: () => replayRead(),
    environment: { document: null }
  });
  const noDom = noDomMount.sync({ serial: 3 });
  assert.equal(noDom.ok, true);
  assert.equal(noDom.consumed, true);
  assert.equal(noDom.rendered, false);
});

test('formatter and renderer reject non-projection shapes without writing unrelated host state', () => {
  assert.throws(() => formatPartnerBattleEventLogProjection({}), /PROJECTION_INVALID/);
  const dom = fakeDocument();
  assert.throws(() => renderPartnerBattleEventLogProjection({}, { document: dom.document }), /PROJECTION_INVALID/);
  assert.equal(dom.host.children.length, 0);
  assert.equal(dom.host.existingText, 'existing battle log content');
});
