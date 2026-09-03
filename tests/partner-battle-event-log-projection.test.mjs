import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PARTNER_BATTLE_EVENT_PROJECTION,
  createPartnerBattleEventLogConsumerAdapter,
  projectPartnerBattleEventLog,
  projectR75BattleHudSummary,
  renderR75BattleHudSummary
} from '../browser/partner-battle-event-log-projection.mjs';
import {
  BATTLE_REPLAY_LIVE_ADAPTER,
  appendAcceptedBattleResolution,
  appendAcceptedMatchEnd,
  createLiveReplaySession,
  createPartnerBattleEventLogPresentationBridge,
  readLiveReplay,
  renderPartnerBattleEventLogProjection
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

function projectedResolutionEvent({ sequence = 1, round = 3, scoreA = 12, scoreB = 9 } = {}) {
  return {
    sequence,
    kind: 'battle_resolution',
    privateData: { secret: 'must-not-project' },
    publicData: {
      serial: sequence,
      round,
      mode: '2v2',
      attackerId: 'raw-user-a',
      defenderId: 'raw-user-b',
      lane: 'left',
      shield: 'shield-card-id',
      winnerIds: ['raw-user-a'],
      winningTeam: 'A',
      teamTotals: { A: scoreA, B: scoreB },
      players: [
        { id: 'raw-user-a', name: 'Private Display Name', team: 'A', score: scoreA, winner: true, cards: [{ cardId: 'c1', label: 'ignored label', value: 5, origin: 'hand' }] },
        { id: 'raw-user-b', name: 'Other Name', team: 'B', score: scoreB, winner: false, cards: [{ cardId: 'c2', value: 4, origin: 'shield' }] }
      ],
      laneGains: [{ id: 'raw-user-a', lane: 'left', before: 2, after: 4, added: 2 }],
      maxLaneProgress: [{ id: 'raw-user-a', before: 2, after: 4 }]
    }
  };
}

test('projects canonical battle resolution without player identity or privateData', () => {
  const result = projectPartnerBattleEventLog(replay([projectedResolutionEvent()]));

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
  assert.deepEqual(PARTNER_BATTLE_EVENT_PROJECTION.r75Hud.fields, ['TURN', 'A_B_SCORE_IF_AVAILABLE']);
  assert.equal(PARTNER_BATTLE_EVENT_PROJECTION.r75Hud.selfCardHistory, 'UNRESOLVED_WITHOUT_VIEWER_IDENTITY');
  assert.equal(PARTNER_BATTLE_EVENT_PROJECTION.r75Hud.opponentHate, 'UNRESOLVED_NOT_PROJECTED');
});

test('R75 HUD summary uses only latest accepted public Battle resolution and never invents unavailable fields', () => {
  const projection = projectPartnerBattleEventLog(replay([
    projectedResolutionEvent({ sequence: 1, round: 2, scoreA: 8, scoreB: 7 }),
    projectedResolutionEvent({ sequence: 2, round: 3, scoreA: 12, scoreB: 9 })
  ]));
  const summary = projectR75BattleHudSummary(projection);
  assert.deepEqual(summary, {
    ok: true,
    presentationOnly: true,
    matchId: 'match-evidence-1',
    sourceSequence: 2,
    turn: 3,
    score: { A: 12, B: 9 },
    selfCardHistory: null,
    opponentHate: null,
    unresolved: [
      'SELF_CARD_HISTORY_NEEDS_VIEWER_IDENTITY_AUTHORITY',
      'OPPONENT_HATE_NOT_IN_PUBLIC_REPLAY_PROJECTION'
    ]
  });
  assert.equal(JSON.stringify(summary).includes('raw-user-a'), false);
  assert.deepEqual(
    projectR75BattleHudSummary(projectPartnerBattleEventLog(replay([]))),
    { ok: false, reason: 'R75_ACCEPTED_BATTLE_STATE_UNAVAILABLE' }
  );
});

test('consumer adapter invokes R75 HUD presentation with the same sanitized projection and keeps gameplay success independent', () => {
  const seen = [];
  const adapter = createPartnerBattleEventLogConsumerAdapter({
    readReplay: () => replay([projectedResolutionEvent({ round: 4, scoreA: 15, scoreB: 13 })]),
    consumeProjection: () => {},
    renderHud(projection) {
      seen.push(projectR75BattleHudSummary(projection));
      throw new Error('presentation-only failure after capture');
    }
  });
  const result = adapter();
  assert.equal(result.ok, true);
  assert.equal(result.consumed, true);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].turn, 4);
  assert.deepEqual(seen[0].score, { A: 15, B: 13 });
});

function fakeR75HudDocument() {
  function node(tag) {
    const children = [];
    let text = '';
    return {
      tagName: String(tag).toUpperCase(),
      id: '',
      attributes: {},
      dataset: {},
      children,
      set textContent(value) { text = String(value); children.length = 0; },
      get textContent() { return children.length ? children.map(child => child.textContent).join(' ') : text; },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      getAttribute(name) { return this.attributes[name] ?? null; },
      appendChild(child) { children.push(child); return child; },
      replaceChildren(...next) { children.splice(0, children.length, ...next); text = ''; },
      querySelector(selector) {
        if (selector !== '[data-battle-r75-hud-summary]') return null;
        return children.find(child => Object.prototype.hasOwnProperty.call(child.attributes, 'data-battle-r75-hud-summary')) || null;
      }
    };
  }
  const head = node('head');
  const surface = node('div');
  const ids = new Map([['battlePhaseSurface', surface]]);
  const document = {
    head,
    createElement: tag => node(tag),
    getElementById(id) {
      if (id === 'gameroad-r75-battle-hud-summary-style') {
        return head.children.find(child => child.id === id) || null;
      }
      return ids.get(id) || null;
    }
  };
  return { document, head, surface };
}

test('R75 HUD renderer mounts TURN and actual A/B score on Battle surface without player identity or fake HATE/card history', () => {
  const fake = fakeR75HudDocument();
  const projection = projectPartnerBattleEventLog(replay([
    projectedResolutionEvent({ round: 5, scoreA: 21, scoreB: 18 })
  ]));
  assert.equal(renderR75BattleHudSummary(projection, { document: fake.document }), true);
  assert.equal(fake.surface.children.length, 1);
  const host = fake.surface.children[0];
  assert.equal(host.dataset.presentationOnly, 'true');
  assert.equal(host.dataset.selfCardHistory, 'unresolved');
  assert.equal(host.dataset.opponentHate, 'unresolved');
  assert.match(host.textContent, /TURN 5/);
  assert.match(host.textContent, /SCORE A 21 \/ B 18/);
  assert.equal(host.textContent.includes('P1'), false);
  assert.equal(host.textContent.includes('HATE'), false);
  assert.equal(fake.head.children.length, 1);
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
  function createNode(tag) {
    const children = [];
    let ownTextContent = '';
    return {
      tagName: String(tag).toUpperCase(),
      attributes: {},
      dataset: {},
      style: {},
      children,
      set textContent(value) {
        ownTextContent = String(value);
        children.length = 0;
      },
      get textContent() {
        return children.length > 0
          ? children.map(child => child.textContent).join('\n')
          : ownTextContent;
      },
      setAttribute(name, value) {
        this.attributes[name] = String(value);
      },
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
      },
      appendChild(node) {
        children.push(node);
        return node;
      },
      replaceChildren(...nodes) {
        children.splice(0, children.length, ...nodes);
        ownTextContent = '';
      }
    };
  }

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
      return createNode(tag);
    }
  };
  return { document, shell, children };
}

test('current live replay feeds the existing Battle log surface through incremental sanitized Partner additions', () => {
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
  assert.equal(host.children.length, 1);
  assert.equal(host.children[0].getAttribute('data-partner-battle-event-log-row'), '1');
  assert.match(host.textContent, /第1ラウンド/);
  assert.match(host.textContent, /C列/);
  assert.match(host.textContent, /A 21 \/ B 18/);
  assert.match(host.textContent, /勝者2人/);

  const firstRow = host.children[0];
  const firstRowText = firstRow.textContent;
  const duplicateProjection = partnerBridge.acceptSession(session);
  assert.equal(duplicateProjection.ok, true);
  assert.equal(duplicateProjection.consumed, true);
  assert.equal(host.children.length, 1);
  assert.equal(host.children[0], firstRow);
  assert.equal(host.children[0].textContent, firstRowText);

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
  assert.equal(host.children.length, 2);
  assert.equal(host.children[0], firstRow);
  assert.equal(host.children[1].getAttribute('data-partner-battle-event-log-row'), '2');
  assert.match(host.textContent, /対戦終了・第1ラウンド・勝者2人/);
  assert.equal(readLiveReplay(session).events.length, 2);
});

test('Partner Battle log projection fails closed on prefix divergence or count regression without mutating accepted rows', () => {
  const fake = fakeBattleLogDocument();
  const base = {
    ok: true,
    schema: PARTNER_BATTLE_EVENT_PROJECTION.schema,
    events: [{
      sequence: 1,
      kind: 'match_ended',
      data: { round: 1, mode: '2v2', winnerCount: 2 }
    }]
  };

  assert.equal(renderPartnerBattleEventLogProjection(base, { document: fake.document }), true);
  const host = fake.children[0];
  const firstRow = host.children[0];
  const acceptedText = host.textContent;

  const divergent = {
    ...base,
    events: [{
      sequence: 1,
      kind: 'match_ended',
      data: { round: 2, mode: '2v2', winnerCount: 2 }
    }]
  };
  assert.equal(renderPartnerBattleEventLogProjection(divergent, { document: fake.document }), false);
  assert.equal(host.children.length, 1);
  assert.equal(host.children[0], firstRow);
  assert.equal(host.textContent, acceptedText);
  assert.equal(host.dataset.partnerBattleEventCount, '1');

  assert.equal(renderPartnerBattleEventLogProjection({ ...base, events: [] }, { document: fake.document }), false);
  assert.equal(host.children.length, 1);
  assert.equal(host.children[0], firstRow);
  assert.equal(host.textContent, acceptedText);
  assert.equal(host.dataset.partnerBattleEventCount, '1');
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