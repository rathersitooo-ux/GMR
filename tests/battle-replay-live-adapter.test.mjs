import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BATTLE_REPLAY_LIVE_ADAPTER,
  appendAcceptedBattleResolution,
  appendAcceptedMatchEnd,
  battleReplayContentVersion,
  battleReplayRulesVersion,
  createBattleReplayCardPresentationBridge,
  createBattleReplayVersionAuthority,
  createBattleScreenLivePresentationBridge,
  createLiveReplaySession,
  projectAcceptedBattleResolution,
  readBattleReplayCardPresentationPreferences,
  readLiveReplay,
  renderBattleReplayCardPresentationPlan
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

function fourSeatResolution(serial = 1) {
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
      { id: 'P1', name: 'Naki A', team: 'A', score: 11, winner: true, cards: [] },
      { id: 'P2', name: 'Naki B', team: 'A', score: 10, winner: true, cards: [] },
      { id: 'P3', name: 'Naki C', team: 'B', score: 9, winner: false, cards: [] },
      { id: 'P4', name: 'Naki D', team: 'B', score: 9, winner: false, cards: [] }
    ],
    laneGains: [{ id: 'P1', lane: 'C', before: 2, after: 4, added: 2 }],
    maxLaneProgress: [
      { id: 'P1', before: 2, after: 4 },
      { id: 'P2', before: 3, after: 5 },
      { id: 'P3', before: 1, after: 2 },
      { id: 'P4', before: 0, after: 1 }
    ]
  };
}

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach(name => this.values.add(name)); }
  remove(...names) { names.forEach(name => this.values.delete(name)); }
  toggle(name, force) {
    if (force === true) { this.values.add(name); return true; }
    if (force === false) { this.values.delete(name); return false; }
    if (this.values.has(name)) { this.values.delete(name); return false; }
    this.values.add(name); return true;
  }
  contains(name) { return this.values.has(name); }
}

function fakePresentationDocument({ reduceMotion = false, lowPerf = false } = {}) {
  const styles = new Map();
  const box = { dataset: {}, classList: new FakeClassList() };
  const resultHeadline = { dataset: {}, classList: new FakeClassList() };
  const elements = new Map([
    ['battleResolution', box],
    ['resultHeadline', resultHeadline],
    ['reduceMotion', { textContent: reduceMotion ? 'ON' : 'OFF' }],
    ['lowPerf', { textContent: lowPerf ? 'ON' : 'OFF' }]
  ]);
  const document = {
    head: {
      appendChild(node) {
        styles.set(node.id, node);
        elements.set(node.id, node);
      }
    },
    createElement(tag) { return { tagName: tag.toUpperCase(), id: '', textContent: '' }; },
    getElementById(id) { return elements.get(id) || null; }
  };
  return { document, box, resultHeadline, styles };
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
  const changed = [{ id: 'A', power: 4, nested: { b: 2, a: 1 } }];
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
  assert.equal(projected.shield, 'C');
});

test('public shield projection preserves current string/null values and rejects wider secret-bearing shapes', () => {
  const nullable = resolution();
  nullable.shield = null;
  assert.equal(projectAcceptedBattleResolution(nullable).shield, null);

  for (const shield of [
    { position: 'C', hiddenCardId: 'SECRET_SHIELD' },
    ['C'],
    '',
    '   ',
    1,
    true
  ]) {
    const input = resolution();
    input.shield = shield;
    assert.throws(
      () => projectAcceptedBattleResolution(input),
      /RESOLUTION_SHIELD_INVALID/
    );
  }
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

test('accepted public replay event feeds fallback-only presentation with no gameplay payload or audio', () => {
  const plans = [];
  const bridge = createBattleReplayCardPresentationBridge({
    document: null,
    matchMedia: () => ({ matches: false }),
    renderPlan: plan => plans.push(plan)
  });
  bridge.begin('M-PRESENT');
  const first = bridge.acceptAcceptedResolution({ matchId: 'M-PRESENT', serial: 1 });
  const duplicate = bridge.acceptAcceptedResolution({ matchId: 'M-PRESENT', serial: 1 });
  assert.equal(first.accepted, true);
  assert.equal(first.duplicate, false);
  assert.equal(first.plan.presentationOnly, true);
  assert.equal(first.plan.eventId, 'battle-resolution:1');
  assert.equal(first.plan.kind, 'vfx');
  assert.equal(first.plan.visibility, 'public');
  assert.deepEqual(first.plan.visual, { source: 'fallback', motion: 'allowed' });
  assert.deepEqual(first.plan.audio, { source: 'silent' });
  assert.equal(duplicate.accepted, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(plans.length, 1);
  assert.deepEqual(bridge.snapshot('M-PRESENT').seenEventIds, ['battle-resolution:1']);
  assert.deepEqual(BATTLE_REPLAY_LIVE_ADAPTER.cardPresentation, {
    source: 'accepted_public_battle_resolution',
    kind: 'vfx',
    assetAuthority: 'fallback_only',
    audio: 'silent'
  });
});

test('four-lane Battle screen bridge projects accepted public four-seat truth without a second gameplay authority', () => {
  const rendered = [];
  const bridge = createBattleScreenLivePresentationBridge({
    document: null,
    matchMedia: () => ({ matches: false }),
    renderModel(model) { rendered.push(model); return true; }
  });
  bridge.begin('M-SCREEN-4');
  const result = bridge.acceptAcceptedResolution({
    matchId: 'M-SCREEN-4',
    publicResolution: projectAcceptedBattleResolution(fourSeatResolution(1))
  });
  assert.equal(result.accepted, true);
  assert.equal(result.rendered, true);
  assert.equal(rendered.length, 1);
  assert.equal(result.model.presentationOnly, true);
  assert.equal(result.model.gameplayAuthority, false);
  assert.equal(result.model.gameStateWrite, false);
  assert.equal(result.model.winnerCalculation, false);
  assert.equal(result.model.targetCalculation, false);
  assert.equal(result.model.screenMode, 'BATTLE_PHASE');
  assert.equal(result.model.phase, 'compare4');
  assert.equal(result.model.returnIntent, 'MATCH_PLAN');
  assert.deepEqual(result.model.lanes.map(row => row.id), ['P1', 'P2', 'P3', 'P4']);
  assert.deepEqual(result.model.lanes.map(row => row.role), ['winner', 'winner', 'revealed', 'revealed']);
  assert.deepEqual(result.model.persistentAfterstate.map(row => row.text), ['進行 4/7', '進行 5/7', '進行 2/7', '進行 1/7']);
  assert.deepEqual(BATTLE_REPLAY_LIVE_ADAPTER.battleScreen, {
    source: 'accepted_public_battle_resolution_and_match_end',
    actualDomSurface: 'battlePhaseSurface',
    laneCount: 4,
    runtime: 'battle-screen-runtime-mount.mjs',
    authority: 'presentation_only_no_game_state_write'
  });
});

test('four-lane Battle screen keeps accepted afterstate and uses accepted formal winner set for final finisher', () => {
  const rendered = [];
  const bridge = createBattleScreenLivePresentationBridge({
    document: null,
    renderModel(model) { rendered.push(model); return true; }
  });
  bridge.begin('M-SCREEN-FINISH');
  const input = fourSeatResolution(1);
  input.mode = '4p';
  input.winnerIds = ['P4'];
  input.players = input.players.map(player => ({ ...player, winner: player.id === 'P4' }));
  input.maxLaneProgress = [
    { id: 'P1', before: 4, after: 4 },
    { id: 'P2', before: 5, after: 5 },
    { id: 'P3', before: 2, after: 3 },
    { id: 'P4', before: 6, after: 7 }
  ];
  bridge.acceptAcceptedResolution({
    matchId: 'M-SCREEN-FINISH',
    publicResolution: projectAcceptedBattleResolution(input)
  });
  const ended = bridge.acceptAcceptedMatchEnd({
    matchId: 'M-SCREEN-FINISH',
    publicMatchEnd: {
      winnerIds: ['P4'],
      round: 1,
      mode: '4p',
      formalRanking: [
        { id: 'P4', rank: 1, maxColumn: 7 },
        { id: 'P2', rank: 2, maxColumn: 5 },
        { id: 'P1', rank: 3, maxColumn: 4 },
        { id: 'P3', rank: 4, maxColumn: 3 }
      ]
    }
  });
  assert.equal(ended.accepted, true);
  assert.equal(ended.model.phase, 'finisher');
  assert.equal(ended.model.transition, 'FINISHER_GATHER');
  assert.equal(ended.model.returnIntent, 'RESULT');
  assert.deepEqual(ended.model.focus.winnerIds, ['P4']);
  assert.deepEqual(ended.model.lanes.map(row => row.role), ['loser', 'loser', 'loser', 'winner']);
  assert.deepEqual(ended.model.persistentAfterstate.map(row => row.text), ['進行 4/7', '進行 5/7', '進行 3/7', '進行 7/7']);
  assert.equal(rendered.length, 2);
});

test('live adapter dispatches only committed public Battle truth into the four-lane screen bridge and stays fail-soft', () => {
  const calls = [];
  const screenBridge = {
    begin(matchId) { calls.push(['begin', matchId]); },
    acceptAcceptedResolution(input) { calls.push(['resolution', input]); },
    acceptAcceptedMatchEnd(input) { calls.push(['end', input]); }
  };
  const options = {
    presentationBridge: null,
    battleScreenPresentationBridge: screenBridge,
    partnerBattleEventLogBridge: null
  };
  let session = createLiveReplaySession({ matchId: 'M-SCREEN-LIVE', versions }, options);
  session = appendAcceptedBattleResolution(session, fourSeatResolution(1), options);
  session = appendAcceptedMatchEnd(session, {
    winnerIds: ['P1', 'P2'], round: 1, mode: '2v2'
  }, options);
  assert.equal(readLiveReplay(session).events.length, 2);
  assert.equal(calls[0][0], 'begin');
  assert.equal(calls[1][0], 'resolution');
  assert.equal(calls[1][1].publicResolution.players.length, 4);
  assert.equal('secretFutureState' in calls[1][1].publicResolution, false);
  assert.deepEqual(calls[2], ['end', {
    matchId: 'M-SCREEN-LIVE',
    publicMatchEnd: { winnerIds: ['P1', 'P2'], round: 1, mode: '2v2' }
  }]);

  const throwingScreen = {
    begin() { throw new Error('screen unavailable'); },
    acceptAcceptedResolution() { throw new Error('screen unavailable'); },
    acceptAcceptedMatchEnd() { throw new Error('screen unavailable'); }
  };
  const failSoftOptions = {
    presentationBridge: null,
    battleScreenPresentationBridge: throwingScreen,
    partnerBattleEventLogBridge: null
  };
  let failSoft = createLiveReplaySession({ matchId: 'M-SCREEN-FAILSOFT', versions }, failSoftOptions);
  failSoft = appendAcceptedBattleResolution(failSoft, fourSeatResolution(1), failSoftOptions);
  failSoft = appendAcceptedMatchEnd(failSoft, {
    winnerIds: ['P1', 'P2'], round: 1, mode: '2v2'
  }, failSoftOptions);
  assert.equal(failSoft.ended, true);
  assert.deepEqual(readLiveReplay(failSoft).events.map(event => event.kind), ['battle_resolution', 'match_ended']);
});

test('presentation preferences fail to static-only for user/system motion reduction and low performance', () => {
  const reduced = fakePresentationDocument({ reduceMotion: true });
  assert.deepEqual(
    readBattleReplayCardPresentationPreferences({
      document: reduced.document,
      matchMedia: () => ({ matches: false })
    }),
    { reducedMotion: true, lowPerf: false, audioEnabled: false }
  );
  const low = fakePresentationDocument({ lowPerf: true });
  const bridge = createBattleReplayCardPresentationBridge({
    document: low.document,
    matchMedia: () => ({ matches: false }),
    setTimeout: () => 1
  });
  bridge.begin('M-LOW');
  const result = bridge.acceptAcceptedResolution({ matchId: 'M-LOW', serial: 1 });
  assert.equal(result.plan.visual.motion, 'static_only');
  assert.equal(low.box.classList.contains('grCardPresentationFallback'), true);
  assert.equal(low.box.classList.contains('grCardPresentationMotion'), false);
});

test('fallback renderer adds one transient non-semantic accent and cleans only its own event', () => {
  const fake = fakePresentationDocument();
  const timers = [];
  const plan = Object.freeze({
    presentationOnly: true,
    eventId: 'battle-resolution:7',
    visual: Object.freeze({ source: 'fallback', motion: 'allowed' })
  });
  assert.equal(renderBattleReplayCardPresentationPlan(plan, {
    document: fake.document,
    setTimeout: callback => { timers.push(callback); return 1; }
  }), true);
  assert.equal(fake.styles.size, 1);
  assert.equal(fake.box.dataset.cardPresentation, 'fallback');
  assert.equal(fake.box.dataset.cardPresentationEvent, 'battle-resolution:7');
  assert.equal(fake.box.classList.contains('grCardPresentationFallback'), true);
  assert.equal(fake.box.classList.contains('grCardPresentationMotion'), true);
  timers[0]();
  assert.equal(fake.box.classList.contains('grCardPresentationFallback'), false);
  assert.equal(fake.box.classList.contains('grCardPresentationMotion'), false);
  assert.equal('cardPresentationEvent' in fake.box.dataset, false);
});

test('presentation failure is fail-soft and cannot roll back an accepted replay event', () => {
  const throwingBridge = {
    begin() { throw new Error('visual begin unavailable'); },
    acceptAcceptedResolution() { throw new Error('visual render unavailable'); }
  };
  const initial = createLiveReplaySession(
    { matchId: 'M-FAILSOFT', versions },
    { presentationBridge: throwingBridge }
  );
  const next = appendAcceptedBattleResolution(
    initial,
    resolution(1),
    { presentationBridge: throwingBridge }
  );
  assert.equal(next.lastResolutionSerial, 1);
  assert.equal(next.log.events.length, 1);
  assert.equal(next.log.events[0].kind, 'battle_resolution');
});

test('live replay read fails safe for missing or corrupt input while append remains strict', () => {
  assert.deepEqual(readLiveReplay(null), {
    ok: false,
    status: 'unavailable',
    reason: 'LOG_INVALID'
  });

  let session = createLiveReplaySession({ matchId: 'M-CORRUPT', versions });
  session = appendAcceptedBattleResolution(session, resolution(1));

  const corrupt = JSON.parse(JSON.stringify(session));
  corrupt.log.events[0] = null;
  assert.deepEqual(readLiveReplay(corrupt), {
    ok: false,
    status: 'partial',
    reason: 'EVENT_CORRUPT',
    index: 0
  });

  const wrongIdentity = JSON.parse(JSON.stringify(session));
  wrongIdentity.matchId = 'OTHER';
  assert.deepEqual(readLiveReplay(wrongIdentity), {
    ok: false,
    status: 'unavailable',
    reason: 'MATCH_ID_INVALID'
  });

  assert.throws(
    () => appendAcceptedBattleResolution(null, resolution(1)),
    /LIVE_REPLAY_SESSION_INVALID/
  );

  const healthy = readLiveReplay(session);
  assert.equal(healthy.ok, true);
  assert.equal(healthy.matchId, 'M-CORRUPT');
  assert.equal(healthy.events.length, 1);
});

test('production Browser mounts replay at the canonical accepted Battle seam without a guest-side second capture path', () => {
  const html = readFileSync(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');
  const adapter = readFileSync(new URL('../browser/battle-replay-live-adapter.mjs', import.meta.url), 'utf8');
  const count = (needle) => html.split(needle).length - 1;
  assert.equal(count("import('./battle-replay-live-adapter.mjs')"), 1);
  assert.equal(count("import('./card-presentation-core.mjs')"), 0);
  assert.equal(count('grBattleReplayBegin(state.match)'), 1);
  assert.equal(count('grBattleReplayAcceptResolution(m,m.lastBattleResolution)'), 1);
  assert.equal(count('grBattleReplayEnd(m,winners);return endMatch(winners)'), 1);
  assert.equal(count('id="resultReplay"'), 1);
  assert.equal(count('id="resultReplayEvents"'), 1);
  assert.equal(count('id="resultHeadline"'), 1);
  assert.ok(html.indexOf('m.lastBattleResolution={serial:++m.resolutionSeq') < html.indexOf('grBattleReplayAcceptResolution(m,m.lastBattleResolution)'));
  assert.ok(html.indexOf('grBattleReplayAcceptResolution(m,m.lastBattleResolution)') < html.indexOf('const slaykiaAttackEnd=grSlaykiaAttackEndHook(m)'));
  assert.ok(html.indexOf('grBattleReplayEnd(m,winners);return endMatch(winners)') < html.indexOf('return endMatch(winners)}nextRound()'));
  assert.match(html, /createBattleReplayVersionAuthority\(\{deckRule:DECK_RULE,cardData:window\.__CARD_DATA__\}\)/);
  assert.match(html, /appendAcceptedBattleResolution\(session,resolution\)/);
  assert.match(html, /appendAcceptedMatchEnd\(session,\{winnerIds:\[\.\.\.winners\],round:m\.round,mode:m\.mode\}\)/);
  assert.match(adapter, /from '\.\/card-presentation-core\.mjs';/);
  assert.match(adapter, /from '\.\/battle-conveyor-presentation-core\.mjs';/);
  assert.match(adapter, /from '\.\/battle-screen-presentation-core\.mjs';/);
  assert.match(adapter, /from '\.\/battle-screen-runtime-mount\.mjs';/);
  const replayAppend = adapter.indexOf("kind: 'battle_resolution'");
  const presentationAccept = adapter.indexOf('presentationBridge?.acceptAcceptedResolution?.({');
  const battleScreenAccept = adapter.indexOf('battleScreenPresentationBridge?.acceptAcceptedResolution?.({');
  assert.ok(replayAppend >= 0 && presentationAccept > replayAppend && battleScreenAccept > replayAppend);
});

function replayMatchEndPublicData(matchId, command) {
  const session = appendAcceptedMatchEnd(
    createLiveReplaySession({ matchId, versions }),
    command
  );
  const replay = readLiveReplay(session);
  assert.equal(replay.ok, true);
  assert.equal(replay.events.length, 1);
  assert.equal(replay.events[0].kind, 'match_ended');
  return replay.events[0].publicData;
}

test('Free4P replay preserves caller-authoritative single-winner formal ranking and strips extra fields', () => {
  const formalRanking = [
    { id: 'P4', rank: 4, maxColumn: 2, hidden: 'NO' },
    { id: 'P1', rank: 1, maxColumn: 7, hidden: 'NO' },
    { id: 'P3', rank: 3, maxColumn: 4, hidden: 'NO' },
    { id: 'P2', rank: 2, maxColumn: 6, hidden: 'NO' }
  ];
  const before = JSON.stringify(formalRanking);
  const publicData = replayMatchEndPublicData('M-4P-SINGLE', {
    winnerIds: ['P1'], round: 8, mode: '4p', formalRanking
  });
  assert.equal(JSON.stringify(formalRanking), before);
  assert.deepEqual(publicData, {
    winnerIds: ['P1'],
    round: 8,
    mode: '4p',
    formalRanking: [
      { id: 'P4', rank: 4, maxColumn: 2 },
      { id: 'P1', rank: 1, maxColumn: 7 },
      { id: 'P3', rank: 3, maxColumn: 4 },
      { id: 'P2', rank: 2, maxColumn: 6 }
    ]
  });
  assert.equal('hidden' in publicData.formalRanking[0], false);
});

test('Free4P replay accepts at-or-above-seven atomic co-winners and competition-ranking loser ties', () => {
  const publicData = replayMatchEndPublicData('M-4P-COWIN', {
    winnerIds: ['OMEGA', 'ALPHA'],
    round: 12,
    mode: '4p',
    formalRanking: [
      { id: 'LOSER-B', rank: 3, maxColumn: 5 },
      { id: 'OMEGA', rank: 1, maxColumn: 8 },
      { id: 'LOSER-A', rank: 3, maxColumn: 5 },
      { id: 'ALPHA', rank: 1, maxColumn: 7 }
    ]
  });
  assert.deepEqual(new Map(publicData.formalRanking.map(row => [row.id, row.rank])), new Map([
    ['LOSER-B', 3], ['OMEGA', 1], ['LOSER-A', 3], ['ALPHA', 1]
  ]));
});

test('Free4P replay competition ranking skips after a loser tie and is independent of input or id order', () => {
  const first = replayMatchEndPublicData('M-4P-ORDER-A', {
    winnerIds: ['ZETA'], round: 9, mode: '4p',
    formalRanking: [
      { id: 'MID-B', rank: 2, maxColumn: 6 },
      { id: 'LAST', rank: 4, maxColumn: 3 },
      { id: 'ZETA', rank: 1, maxColumn: 7 },
      { id: 'MID-A', rank: 2, maxColumn: 6 }
    ]
  });
  const second = replayMatchEndPublicData('M-4P-ORDER-B', {
    winnerIds: ['ZETA'], round: 9, mode: '4p',
    formalRanking: [
      { id: 'ZETA', rank: 1, maxColumn: 7 },
      { id: 'MID-A', rank: 2, maxColumn: 6 },
      { id: 'LAST', rank: 4, maxColumn: 3 },
      { id: 'MID-B', rank: 2, maxColumn: 6 }
    ]
  });
  const byId = rows => Object.fromEntries(rows.map(row => [row.id, [row.rank, row.maxColumn]]));
  assert.deepEqual(byId(first.formalRanking), byId(second.formalRanking));
  assert.deepEqual(byId(first.formalRanking), {
    'MID-B': [2, 6], LAST: [4, 3], ZETA: [1, 7], 'MID-A': [2, 6]
  });
});

test('Free4P formal ranking fails closed on rank, winner, duplicate-id, range, and mode mismatches', () => {
  const base = [
    { id: 'P1', rank: 1, maxColumn: 7 },
    { id: 'P2', rank: 2, maxColumn: 6 },
    { id: 'P3', rank: 3, maxColumn: 5 },
    { id: 'P4', rank: 4, maxColumn: 4 }
  ];
  const initial = () => createLiveReplaySession({ matchId: `M-BAD-${Math.random()}`, versions });

  assert.throws(() => appendAcceptedMatchEnd(initial(), {
    winnerIds: ['P1'], round: 1, mode: '4p',
    formalRanking: base.map(row => row.id === 'P3' ? { ...row, rank: 4 } : row)
  }), /MATCH_END_FORMAL_RANK_MISMATCH/);

  assert.throws(() => appendAcceptedMatchEnd(initial(), {
    winnerIds: ['P1'], round: 1, mode: '4p',
    formalRanking: base.map(row => row.id === 'P2' ? { ...row, maxColumn: 7, rank: 1 } : row)
  }), /MATCH_END_FORMAL_WINNER_MISMATCH/);

  assert.throws(() => appendAcceptedMatchEnd(initial(), {
    winnerIds: ['P1'], round: 1, mode: '4p',
    formalRanking: base.map((row, index) => index === 3 ? { ...row, id: 'P3' } : row)
  }), /MATCH_END_FORMAL_RANKING_DUPLICATE_ID/);

  assert.throws(() => appendAcceptedMatchEnd(initial(), {
    winnerIds: ['P1'], round: 1, mode: '4p',
    formalRanking: base.map(row => row.id === 'P4' ? { ...row, maxColumn: -1 } : row)
  }), /MATCH_END_FORMAL_MAX_COLUMN_INVALID/);

  assert.throws(() => appendAcceptedMatchEnd(initial(), {
    winnerIds: ['P1'], round: 1, mode: '2v2', formalRanking: base
  }), /MATCH_END_FORMAL_RANKING_MODE_INVALID/);
});

test('2v2 match-end replay remains backward-compatible and does not invent a formal ranking', () => {
  const publicData = replayMatchEndPublicData('M-2V2-REGRESSION', {
    winnerIds: ['P1', 'P2'], round: 3, mode: '2v2'
  });
  assert.deepEqual(publicData, {
    winnerIds: ['P1', 'P2'],
    round: 3,
    mode: '2v2'
  });
  assert.equal('formalRanking' in publicData, false);
});

test('Free4P single-winner match end mounts existing FINISHER_GATHER planner with exactly three ranking-derived losers', () => {
  const rendered = [];
  const bridge = createBattleReplayCardPresentationBridge({
    document: null,
    matchMedia: () => ({ matches: false }),
    renderPlan: plan => rendered.push(plan)
  });
  let session = createLiveReplaySession(
    { matchId: 'M-FINISHER', versions },
    { presentationBridge: bridge }
  );
  session = appendAcceptedMatchEnd(session, {
    winnerIds: ['P1'],
    round: 8,
    mode: '4p',
    formalRanking: [
      { id: 'P4', rank: 4, maxColumn: 2 },
      { id: 'P1', rank: 1, maxColumn: 7 },
      { id: 'P3', rank: 3, maxColumn: 4 },
      { id: 'P2', rank: 2, maxColumn: 6 }
    ]
  }, { presentationBridge: bridge });

  assert.equal(session.ended, true);
  assert.equal(readLiveReplay(session).events[0].kind, 'match_ended');
  assert.equal(rendered.length, 1);
  const plan = rendered[0];
  assert.equal(plan.presentationOnly, true);
  assert.equal(plan.kind, 'finisher');
  assert.equal(plan.transition, 'FINISHER_GATHER');
  assert.equal(plan.publicData.winnerId, 'P1');
  assert.deepEqual(plan.groupTargets, ['P4', 'P3', 'P2']);
  assert.deepEqual(plan.publicData.loserIds, ['P4', 'P3', 'P2']);
  assert.equal(plan.timing.markers.anticipation, 520);
  assert.equal(plan.timing.markers.handoffLead, 330);
  assert.equal(bridge.snapshot('M-FINISHER').lastFinisherPlan.transition, 'FINISHER_GATHER');
  assert.deepEqual(BATTLE_REPLAY_LIVE_ADAPTER.matchEndFinisher, {
    source: 'accepted_free4p_single_winner_formal_ranking',
    kind: 'finisher',
    transition: 'FINISHER_GATHER',
    authority: 'presentation_only_no_game_state_write'
  });
});

test('default match-end finisher consumer reaches current Result winner surface and cleans on planner duration', () => {
  const fake = fakePresentationDocument();
  const timers = [];
  const bridge = createBattleReplayCardPresentationBridge({
    document: fake.document,
    matchMedia: () => ({ matches: false }),
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); return 1; }
  });
  let session = createLiveReplaySession(
    { matchId: 'M-FINISHER-RESULT', versions },
    { presentationBridge: bridge }
  );
  session = appendAcceptedMatchEnd(session, {
    winnerIds: ['P1'], round: 8, mode: '4p',
    formalRanking: [
      { id: 'P4', rank: 4, maxColumn: 2 },
      { id: 'P1', rank: 1, maxColumn: 7 },
      { id: 'P3', rank: 3, maxColumn: 4 },
      { id: 'P2', rank: 2, maxColumn: 6 }
    ]
  }, { presentationBridge: bridge });

  const plan = bridge.snapshot('M-FINISHER-RESULT').lastFinisherPlan;
  assert.equal(session.ended, true);
  assert.equal(plan.transition, 'FINISHER_GATHER');
  assert.equal(fake.resultHeadline.dataset.matchEndFinisher, 'FINISHER_GATHER');
  assert.equal(fake.resultHeadline.dataset.matchEndFinisherEvent, 'match-end-finisher:M-FINISHER-RESULT');
  assert.equal(fake.resultHeadline.dataset.matchEndFinisherWinner, 'P1');
  assert.equal(fake.resultHeadline.dataset.matchEndFinisherMotion, 'allowed');
  assert.equal(fake.resultHeadline.classList.contains('grMatchEndFinisher'), true);
  assert.equal(fake.resultHeadline.classList.contains('grMatchEndFinisherMotion'), true);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, plan.timing.duration);
  timers[0].callback();
  assert.equal(fake.resultHeadline.classList.contains('grMatchEndFinisher'), false);
  assert.equal('matchEndFinisherEvent' in fake.resultHeadline.dataset, false);
});

test('default finisher consumer preserves a static Result marker when motion is reduced', () => {
  const fake = fakePresentationDocument({ reduceMotion: true });
  const bridge = createBattleReplayCardPresentationBridge({
    document: fake.document,
    matchMedia: () => ({ matches: false }),
    setTimeout: () => 1
  });
  const result = bridge.acceptAcceptedMatchEnd({
    matchId: 'M-FINISHER-STATIC',
    winnerId: 'P1',
    loserIds: ['P2', 'P3', 'P4']
  });
  assert.equal(result.accepted, true);
  assert.equal(result.plan.reducedMotion, true);
  assert.equal(fake.resultHeadline.dataset.matchEndFinisher, 'FINISHER_GATHER');
  assert.equal(fake.resultHeadline.dataset.matchEndFinisherMotion, 'static_only');
  assert.equal(fake.resultHeadline.classList.contains('grMatchEndFinisher'), true);
  assert.equal(fake.resultHeadline.classList.contains('grMatchEndFinisherMotion'), false);
});

test('co-winner Free4P and non-4p match end never emit a false finisher', () => {
  const rendered = [];
  const bridge = createBattleReplayCardPresentationBridge({
    document: null,
    renderPlan: plan => rendered.push(plan)
  });

  const coWinner = createLiveReplaySession(
    { matchId: 'M-FINISHER-COWIN', versions },
    { presentationBridge: bridge }
  );
  const coWinnerEnded = appendAcceptedMatchEnd(coWinner, {
    winnerIds: ['P1', 'P2'],
    round: 4,
    mode: '4p',
    formalRanking: [
      { id: 'P1', rank: 1, maxColumn: 7 },
      { id: 'P2', rank: 1, maxColumn: 7 },
      { id: 'P3', rank: 3, maxColumn: 5 },
      { id: 'P4', rank: 4, maxColumn: 4 }
    ]
  }, { presentationBridge: bridge });
  assert.equal(coWinnerEnded.ended, true);
  assert.equal(bridge.snapshot('M-FINISHER-COWIN').lastFinisherPlan, null);

  const team = createLiveReplaySession(
    { matchId: 'M-FINISHER-2V2', versions },
    { presentationBridge: bridge }
  );
  const teamEnded = appendAcceptedMatchEnd(team, {
    winnerIds: ['P1', 'P2'], round: 5, mode: '2v2'
  }, { presentationBridge: bridge });
  assert.equal(teamEnded.ended, true);
  assert.equal(bridge.snapshot('M-FINISHER-2V2').lastFinisherPlan, null);
  assert.equal(rendered.length, 0);
});

test('match-end finisher presentation failure is fail-soft after accepted replay truth commits', () => {
  const throwingBridge = {
    begin() {},
    acceptAcceptedMatchEnd() { throw new Error('finisher renderer unavailable'); }
  };
  const initial = createLiveReplaySession(
    { matchId: 'M-FINISHER-FAILSOFT', versions },
    { presentationBridge: throwingBridge }
  );
  const ended = appendAcceptedMatchEnd(initial, {
    winnerIds: ['P1'],
    round: 6,
    mode: '4p',
    formalRanking: [
      { id: 'P1', rank: 1, maxColumn: 7 },
      { id: 'P2', rank: 2, maxColumn: 6 },
      { id: 'P3', rank: 3, maxColumn: 5 },
      { id: 'P4', rank: 4, maxColumn: 4 }
    ]
  }, { presentationBridge: throwingBridge });
  const replay = readLiveReplay(ended);
  assert.equal(ended.ended, true);
  assert.equal(replay.ok, true);
  assert.equal(replay.events.length, 1);
  assert.equal(replay.events[0].kind, 'match_ended');
  assert.deepEqual(replay.events[0].publicData.winnerIds, ['P1']);
});

test('Free4P omitted formalRanking derives single-winner competition ranking from latest accepted maxLaneProgress', () => {
  const input = resolution(1);
  input.mode = '4p';
  input.winnerIds = ['P1'];
  input.maxLaneProgress = [
    { id: 'P1', before: 6, after: 7 },
    { id: 'P2', before: 5, after: 5 },
    { id: 'P3', before: 4, after: 5 },
    { id: 'P4', before: 2, after: 2 }
  ];
  let session = createLiveReplaySession({ matchId: 'M-4P-DERIVE-SINGLE', versions });
  session = appendAcceptedBattleResolution(session, input);
  session = appendAcceptedMatchEnd(session, { winnerIds: ['P1'], round: 1, mode: '4p' });
  const publicData = readLiveReplay(session).events[1].publicData;
  assert.deepEqual(publicData.formalRanking, [
    { id: 'P1', rank: 1, maxColumn: 7 },
    { id: 'P2', rank: 2, maxColumn: 5 },
    { id: 'P3', rank: 2, maxColumn: 5 },
    { id: 'P4', rank: 4, maxColumn: 2 }
  ]);
});

test('Free4P omitted formalRanking derives simultaneous co-winners and skips following competition rank', () => {
  const input = resolution(1);
  input.mode = '4p';
  input.winnerIds = ['P1', 'P2'];
  input.maxLaneProgress = [
    { id: 'P1', before: 6, after: 7 },
    { id: 'P2', before: 6, after: 7 },
    { id: 'P3', before: 4, after: 4 },
    { id: 'P4', before: 1, after: 1 }
  ];
  let session = createLiveReplaySession({ matchId: 'M-4P-DERIVE-COWIN', versions });
  session = appendAcceptedBattleResolution(session, input);
  session = appendAcceptedMatchEnd(session, {
    winnerIds: ['P1', 'P2'], round: 1, mode: '4p'
  });
  assert.deepEqual(readLiveReplay(session).events[1].publicData.formalRanking, [
    { id: 'P1', rank: 1, maxColumn: 7 },
    { id: 'P2', rank: 1, maxColumn: 7 },
    { id: 'P3', rank: 3, maxColumn: 4 },
    { id: 'P4', rank: 4, maxColumn: 1 }
  ]);
});

test('Free4P omitted formalRanking preserves unequal-depth atomic co-winners from accepted maxLaneProgress', () => {
  const input = resolution(1);
  input.mode = '4p';
  input.winnerIds = ['P1', 'P2'];
  input.maxLaneProgress = [
    { id: 'P1', before: 6, after: 8 },
    { id: 'P2', before: 6, after: 7 },
    { id: 'P3', before: 5, after: 5 },
    { id: 'P4', before: 5, after: 5 }
  ];
  let session = createLiveReplaySession({ matchId: 'M-4P-DERIVE-COWIN-OVER7', versions });
  session = appendAcceptedBattleResolution(session, input);
  session = appendAcceptedMatchEnd(session, {
    winnerIds: ['P1', 'P2'], round: 1, mode: '4p'
  });
  assert.deepEqual(readLiveReplay(session).events[1].publicData.formalRanking, [
    { id: 'P1', rank: 1, maxColumn: 8 },
    { id: 'P2', rank: 1, maxColumn: 7 },
    { id: 'P3', rank: 3, maxColumn: 5 },
    { id: 'P4', rank: 3, maxColumn: 5 }
  ]);
});

test('Free4P omitted formalRanking fails closed when accepted progress is insufficient', () => {
  const input = resolution(1);
  input.mode = '4p';
  input.winnerIds = ['P1'];
  input.maxLaneProgress = [
    { id: 'P1', before: 6, after: 7 },
    { id: 'P2', before: 5, after: 5 },
    { id: 'P3', before: 4, after: 4 }
  ];
  let session = createLiveReplaySession({ matchId: 'M-4P-DERIVE-FALLBACK', versions });
  session = appendAcceptedBattleResolution(session, input);
  assert.throws(
    () => appendAcceptedMatchEnd(session, { winnerIds: ['P1'], round: 1, mode: '4p' }),
    /MATCH_END_FORMAL_RANKING_UNAVAILABLE/
  );
  assert.equal(session.ended, false);
  assert.equal(readLiveReplay(session).events.length, 1);
});

test('Free4P match-end winner set fails closed even when formal ranking cannot be derived', () => {
  for (const [matchId, winnerIds] of [
    ['M-4P-WINNER-EMPTY', []],
    ['M-4P-WINNER-DUP', ['P1', 'P1']]
  ]) {
    const input = resolution(1);
    input.mode = '4p';
    input.winnerIds = winnerIds;
    input.maxLaneProgress = [
      { id: 'P1', before: 6, after: 7 },
      { id: 'P2', before: 5, after: 5 },
      { id: 'P3', before: 4, after: 4 }
    ];
    let session = createLiveReplaySession({ matchId, versions });
    session = appendAcceptedBattleResolution(session, input);
    assert.throws(
      () => appendAcceptedMatchEnd(session, { winnerIds, round: 1, mode: '4p' }),
      /MATCH_END_FORMAL_WINNER_IDS_INVALID/
    );
    assert.equal(session.ended, false);
    assert.equal(readLiveReplay(session).events.length, 1);
  }
});

test('Free4P omitted formalRanking fails closed on accepted progress from a different terminal round', () => {
  const input = resolution(1);
  input.mode = '4p';
  input.winnerIds = ['P1'];
  input.maxLaneProgress = [
    { id: 'P1', before: 6, after: 7 },
    { id: 'P2', before: 5, after: 5 },
    { id: 'P3', before: 4, after: 4 },
    { id: 'P4', before: 2, after: 2 }
  ];
  let session = createLiveReplaySession({ matchId: 'M-4P-R18-ROUND-MISMATCH', versions });
  session = appendAcceptedBattleResolution(session, input);
  assert.throws(
    () => appendAcceptedMatchEnd(session, { winnerIds: ['P1'], round: 2, mode: '4p' }),
    /MATCH_END_FORMAL_RANKING_UNAVAILABLE/
  );
  assert.equal(session.ended, false);
  assert.equal(readLiveReplay(session).events.length, 1);
});

test('Battle conveyor environment advances only on accepted non-duplicate resolution and suppresses travel for reduced/lowPerf', () => {
  const frames = [];
  const bridge = createBattleReplayCardPresentationBridge({
    document: null,
    matchMedia: () => ({ matches: false }),
    renderPlan: () => {},
    renderEnvironment: (frame, eventId) => frames.push({ frame, eventId })
  });
  bridge.begin('M-CONVEYOR-R37');
  const initial = bridge.snapshot('M-CONVEYOR-R37');
  assert.equal(initial.environmentTravel, 0);
  assert.equal(initial.lastEnvironmentFrame.phase, 'IDLE_READ');
  assert.equal(initial.lastEnvironmentFrame.segments.length, 8);
  assert.equal(frames.length, 1);

  const first = bridge.acceptAcceptedResolution({ matchId: 'M-CONVEYOR-R37', serial: 1 });
  assert.equal(first.accepted, true);
  assert.equal(first.duplicate, false);
  const afterFirst = bridge.snapshot('M-CONVEYOR-R37');
  assert.equal(afterFirst.environmentTravel, 0.16);
  assert.equal(afterFirst.lastEnvironmentFrame.phase, 'RESOLVE');
  assert.equal(afterFirst.lastEnvironmentFrame.environmentAuthority, 'decorative_visual_loop_only');
  assert.equal(afterFirst.lastEnvironmentFrame.gameStateWrite, false);
  assert.equal(afterFirst.lastEnvironmentFrame.position109Write, false);
  assert.equal(frames.length, 2);

  const duplicate = bridge.acceptAcceptedResolution({ matchId: 'M-CONVEYOR-R37', serial: 1 });
  assert.equal(duplicate.accepted, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(bridge.snapshot('M-CONVEYOR-R37').environmentTravel, 0.16);
  assert.equal(frames.length, 2);

  for (const profile of [
    { reduceMotion: true, lowPerf: false, id: 'REDUCED' },
    { reduceMotion: false, lowPerf: true, id: 'LOWPERF' }
  ]) {
    const profileFrames = [];
    const fake = fakePresentationDocument(profile);
    const profileBridge = createBattleReplayCardPresentationBridge({
      document: fake.document,
      matchMedia: () => ({ matches: false }),
      renderPlan: () => {},
      renderEnvironment: (frame) => profileFrames.push(frame)
    });
    profileBridge.begin(`M-CONVEYOR-${profile.id}`);
    profileBridge.acceptAcceptedResolution({ matchId: `M-CONVEYOR-${profile.id}`, serial: 1 });
    const snapshot = profileBridge.snapshot(`M-CONVEYOR-${profile.id}`);
    assert.equal(snapshot.environmentTravel, 0);
    assert.equal(snapshot.lastEnvironmentFrame.motionSuppressed, true);
    assert.equal(snapshot.lastEnvironmentFrame.effectiveTravel, 0);
    assert.equal(profileFrames.at(-1).segments.length, 8);
  }
});
