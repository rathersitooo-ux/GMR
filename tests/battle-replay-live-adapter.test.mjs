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
  const elements = new Map([
    ['battleResolution', box],
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
  return { document, box, styles };
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
  assert.ok(html.indexOf('m.lastBattleResolution={serial:++m.resolutionSeq') < html.indexOf('grBattleReplayAcceptResolution(m,m.lastBattleResolution)'));
  assert.ok(html.indexOf('grBattleReplayAcceptResolution(m,m.lastBattleResolution)') < html.indexOf('const slaykiaAttackEnd=grSlaykiaAttackEndHook(m)'));
  assert.ok(html.indexOf('grBattleReplayEnd(m,winners);return endMatch(winners)') < html.indexOf('return endMatch(winners)}nextRound()'));
  assert.match(html, /createBattleReplayVersionAuthority\(\{deckRule:DECK_RULE,cardData:window\.__CARD_DATA__\}\)/);
  assert.match(html, /appendAcceptedBattleResolution\(session,resolution\)/);
  assert.match(html, /appendAcceptedMatchEnd\(session,\{winnerIds:\[\.\.\.winners\],round:m\.round,mode:m\.mode\}\)/);
  assert.match(adapter, /from '\.\/card-presentation-core\.mjs';/);
  const replayAppend = adapter.indexOf("kind: 'battle_resolution'");
  const presentationAccept = adapter.indexOf('presentationBridge?.acceptAcceptedResolution?.({');
  assert.ok(replayAppend >= 0 && presentationAccept > replayAppend);
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

test('Free4P replay accepts simultaneous seven-card co-winners and competition-ranking loser ties', () => {
  const publicData = replayMatchEndPublicData('M-4P-COWIN', {
    winnerIds: ['OMEGA', 'ALPHA'],
    round: 12,
    mode: '4p',
    formalRanking: [
      { id: 'LOSER-B', rank: 3, maxColumn: 5 },
      { id: 'OMEGA', rank: 1, maxColumn: 7 },
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
    formalRanking: base.map(row => row.id === 'P4' ? { ...row, maxColumn: 8 } : row)
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