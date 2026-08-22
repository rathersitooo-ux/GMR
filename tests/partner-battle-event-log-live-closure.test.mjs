import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_REPLAY_LIVE_ADAPTER,
  appendAcceptedBattleResolution,
  appendAcceptedMatchEnd,
  createLiveReplaySession,
  createPartnerBattleEventLogPresentationBridge,
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
    { matchId: 'M-PARTNER-LOG', versions },
    { partnerBattleEventLogBridge: partnerBridge }
  );
  session = appendAcceptedBattleResolution(
    session,
    resolution(1),
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
    { matchId: 'M-PARTNER-FAILSOFT', versions },
    { partnerBattleEventLogBridge: unavailableBridge }
  );
  session = appendAcceptedBattleResolution(
    session,
    resolution(1),
    { partnerBattleEventLogBridge: unavailableBridge }
  );
  const replay = readLiveReplay(session);
  assert.equal(replay.ok, true);
  assert.equal(replay.events.length, 1);
  assert.equal(replay.events[0].kind, 'battle_resolution');
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
