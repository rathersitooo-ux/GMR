import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_REPLAY_CORE,
  appendAcceptedEvent,
  createReplayBroadcastDirectorState,
  createReplayLog,
  createReplayShotCandidate,
  decideReplayBroadcastShot,
  projectReplayDirectorDecision,
  readReplay,
  scoreReplayShotCandidate,
  validateReplayLog
} from '../browser/battle-replay-core.mjs';

const versions = Object.freeze({ rules: 'rules-r1', content: 'content-r1', state: 'state-r1' });
const supportedVersions = Object.freeze({
  rules: ['rules-r1'],
  content: ['content-r1'],
  state: ['state-r1']
});

function sampleLog() {
  let log = createReplayLog({ matchId: 'M-TEST-1', versions });
  log = appendAcceptedEvent(log, {
    kind: 'round_resolved',
    publicData: { round: 1, winnerIds: ['P1'] },
    privateByViewer: {
      P1: { ownReservedBattle: 'SP-A' },
      P2: { ownReservedBattle: 'HT-A' }
    },
    authorityOnly: { hiddenOpponentDeckOrder: ['X', 'Y', 'Z'] }
  });
  log = appendAcceptedEvent(log, {
    kind: 'match_ended',
    publicData: { outcome: 'normal', winnerIds: ['P1'] }
  });
  return log;
}

test('accepted events receive stable monotonic order tied to match/version identity', () => {
  const log = sampleLog();
  assert.equal(BATTLE_REPLAY_CORE.schema, 'GAMEROAD_BATTLE_REPLAY_V1');
  assert.deepEqual(log.events.map(event => event.sequence), [1, 2]);
  assert.ok(log.events.every(event => event.matchId === log.matchId));
  assert.ok(log.events.every(event => assert.deepEqual(event.versions, versions) === undefined));
  assert.equal(validateReplayLog(log).ok, true);
  assert.equal(Object.isFrozen(log), true);
  assert.equal(Object.isFrozen(log.events[0]), true);
});

test('viewer projection exposes public facts and only authenticated own private facts', () => {
  const log = sampleLog();
  const p1 = readReplay(log, {
    viewer: { id: 'P1', authenticated: true },
    supportedVersions
  });
  const p2 = readReplay(log, {
    viewer: { id: 'P2', authenticated: true },
    supportedVersions
  });
  const spectator = readReplay(log, {
    viewer: { id: 'SPECTATOR', authenticated: true },
    supportedVersions
  });
  const spoofed = readReplay(log, {
    viewer: { id: 'P1', authenticated: false },
    supportedVersions
  });

  assert.deepEqual(p1.events[0].privateData, { ownReservedBattle: 'SP-A' });
  assert.deepEqual(p2.events[0].privateData, { ownReservedBattle: 'HT-A' });
  assert.equal('privateData' in spectator.events[0], false);
  assert.equal('privateData' in spoofed.events[0], false);
  for (const replay of [p1, p2, spectator, spoofed]) {
    assert.deepEqual(replay.events[0].publicData, { round: 1, winnerIds: ['P1'] });
    assert.equal('authorityOnly' in replay.events[0], false);
    assert.equal('privateByViewer' in replay.events[0], false);
  }
});

test('same log, version set, and viewer deterministically project the same replay twice', () => {
  const log = sampleLog();
  const inputBefore = JSON.stringify(log);
  const options = { viewer: { id: 'P1', authenticated: true }, supportedVersions };
  const first = readReplay(log, options);
  const second = readReplay(log, options);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(log), inputBefore);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.events[0]), true);
});

test('unknown rules/content/state version fails closed instead of recalculating', () => {
  const log = sampleLog();
  for (const key of ['rules', 'content', 'state']) {
    const unsupported = {
      ...supportedVersions,
      [key]: ['different-version']
    };
    assert.deepEqual(readReplay(log, { supportedVersions: unsupported }), {
      ok: false,
      status: 'unavailable',
      reason: 'VERSION_UNSUPPORTED'
    });
  }
  assert.deepEqual(readReplay(log), {
    ok: false,
    status: 'unavailable',
    reason: 'VERSION_UNSUPPORTED'
  });
});

test('duplicate sequence, gap/reorder, identity mismatch, and event-version mismatch stop as partial', () => {
  const cases = [
    ['SEQUENCE_DUPLICATE', raw => { raw.events[1].sequence = 1; }],
    ['SEQUENCE_GAP_OR_REORDER', raw => { raw.events[1].sequence = 3; }],
    ['EVENT_IDENTITY_MISMATCH', raw => { raw.events[1].matchId = 'OTHER'; }],
    ['EVENT_VERSION_MISMATCH', raw => { raw.events[1].versions.rules = 'old-rules'; }]
  ];

  for (const [reason, mutate] of cases) {
    const raw = JSON.parse(JSON.stringify(sampleLog()));
    mutate(raw);
    const validation = validateReplayLog(raw);
    assert.equal(validation.ok, false);
    assert.equal(validation.status, 'partial');
    assert.equal(validation.reason, reason);
    const replay = readReplay(raw, { supportedVersions });
    assert.equal(replay.ok, false);
    assert.equal(replay.reason, reason);
  }
});

test('corrupt event and unknown schema stop without guessed reconstruction', () => {
  const corrupt = JSON.parse(JSON.stringify(sampleLog()));
  corrupt.events[0] = null;
  assert.deepEqual(validateReplayLog(corrupt), {
    ok: false,
    status: 'partial',
    reason: 'EVENT_CORRUPT',
    index: 0
  });

  const unknownSchema = JSON.parse(JSON.stringify(sampleLog()));
  unknownSchema.schema = 'FUTURE_SCHEMA';
  assert.deepEqual(readReplay(unknownSchema, { supportedVersions }), {
    ok: false,
    status: 'unavailable',
    reason: 'SCHEMA_UNKNOWN'
  });
});

test('post-match does not automatically expand secrets', () => {
  const log = sampleLog();
  const afterMatchSpectator = readReplay(log, {
    viewer: { id: 'SPECTATOR', authenticated: true, phase: 'post_match' },
    supportedVersions
  });
  assert.equal(afterMatchSpectator.ok, true);
  assert.equal('privateData' in afterMatchSpectator.events[0], false);
});

const directorPolicy = Object.freeze({
  weights: Object.freeze({
    mandatoryConsequence: 4,
    urgency: 3,
    dramaDelta: 2,
    rarity: 1,
    continuity: 1,
    readiness: 2,
    repeat: 3,
    cutThrash: 3,
    load: 1
  }),
  holdMs: 100,
  hysteresisDelta: 2,
  cooldownMs: 500
});

function directorEvidence(overrides = {}) {
  return {
    privacySafe: true,
    privacyRisk: 0,
    mandatoryConsequence: 1,
    urgency: 1,
    dramaDelta: 1,
    rarity: 1,
    continuity: 1,
    readiness: 1,
    repeat: 0,
    cutThrash: 0,
    load: 0,
    starvationMs: 0,
    ...overrides
  };
}

function publicDirectorEvent(sequence, kind = 'round_resolved') {
  return { sequence, kind, publicData: { round: sequence } };
}

function directorCandidate(sequence, surfaceId, overrides = {}) {
  return createReplayShotCandidate({
    matchId: 'M-DIRECTOR',
    event: publicDirectorEvent(sequence),
    surfaceId,
    evidence: directorEvidence(overrides)
  });
}

test('broadcast director accepts public projection only and keeps candidates/decisions secret-free', () => {
  const log = sampleLog();
  const spectator = readReplay(log, {
    viewer: { id: 'SPECTATOR', authenticated: true },
    supportedVersions
  });
  const p1 = readReplay(log, {
    viewer: { id: 'P1', authenticated: true },
    supportedVersions
  });

  const candidate = createReplayShotCandidate({
    matchId: spectator.matchId,
    event: spectator.events[0],
    surfaceId: 'BOARD',
    evidence: directorEvidence()
  });
  assert.equal(candidate.presentationOnly, true);
  assert.equal('publicData' in candidate, false);
  assert.equal('privateData' in candidate, false);
  assert.equal(Object.isFrozen(candidate), true);
  assert.throws(() => createReplayShotCandidate({
    matchId: p1.matchId,
    event: p1.events[0],
    surfaceId: 'BOARD',
    evidence: directorEvidence()
  }), /DIRECTOR_EVENT_NOT_PUBLIC_ONLY/);
  assert.throws(() => createReplayShotCandidate({
    matchId: spectator.matchId,
    event: spectator.events[0],
    surfaceId: 'BOARD',
    evidence: directorEvidence({ privacyRisk: 1 })
  }), /DIRECTOR_PRIVACY_EVIDENCE_REJECTED/);

  const first = decideReplayBroadcastShot(
    createReplayBroadcastDirectorState(),
    { candidates: [candidate], policy: directorPolicy, nowMs: 0 }
  );
  assert.equal(first.decision.presentationOnly, true);
  assert.equal('publicData' in first.decision, false);
  assert.equal('privateData' in first.decision, false);
  assert.equal('authorityOnly' in first.decision, false);
  assert.equal(Object.isFrozen(first.decision), true);
});

test('broadcast director requires explicit policy values instead of inventing score thresholds', () => {
  const candidate = directorCandidate(1, 'BOARD');
  assert.equal(scoreReplayShotCandidate(candidate, directorPolicy), 13);
  assert.throws(() => scoreReplayShotCandidate(candidate, {
    ...directorPolicy,
    holdMs: undefined
  }), /DIRECTOR_HOLD_MS_INVALID/);
  assert.throws(() => scoreReplayShotCandidate(candidate, {
    ...directorPolicy,
    weights: { ...directorPolicy.weights, urgency: undefined }
  }), /DIRECTOR_WEIGHT_urgency_INVALID/);
});

test('broadcast director holds the active shot before switching to a materially stronger public candidate', () => {
  const board = directorCandidate(1, 'BOARD');
  const animation = directorCandidate(2, 'ANIMATION', {
    mandatoryConsequence: 2,
    urgency: 2
  });
  let state = createReplayBroadcastDirectorState();
  const initial = decideReplayBroadcastShot(
    state,
    { candidates: [board], policy: directorPolicy, nowMs: 0 }
  );
  state = initial.state;
  assert.equal(initial.decision.reason, 'INITIAL');
  assert.equal(initial.decision.selectedCandidateId, board.candidateId);

  const held = decideReplayBroadcastShot(
    state,
    { candidates: [board, animation], policy: directorPolicy, nowMs: 50 }
  );
  assert.equal(held.decision.reason, 'HOLD');
  assert.equal(held.decision.selectedCandidateId, board.candidateId);

  const switched = decideReplayBroadcastShot(
    held.state,
    { candidates: [board, animation], policy: directorPolicy, nowMs: 100 }
  );
  assert.equal(switched.decision.reason, 'VALUE_SWITCH');
  assert.equal(switched.decision.selectedCandidateId, animation.candidateId);
});

test('broadcast director uses deterministic starvation rescue only inside equal score value', () => {
  const current = directorCandidate(1, 'BOARD', { starvationMs: 20 });
  const rescued = directorCandidate(2, 'ANIMATION', { starvationMs: 80 });
  const state = decideReplayBroadcastShot(
    createReplayBroadcastDirectorState(),
    { candidates: [current], policy: directorPolicy, nowMs: 0 }
  ).state;

  const result = decideReplayBroadcastShot(
    state,
    { candidates: [current, rescued], policy: directorPolicy, nowMs: 100 }
  );
  assert.equal(result.decision.reason, 'STARVATION_RESCUE');
  assert.equal(result.decision.selectedCandidateId, rescued.candidateId);
});

test('broadcast director cooldown blocks immediate cut-back to a released shot', () => {
  const a = directorCandidate(1, 'BOARD');
  const b = directorCandidate(2, 'ANIMATION', {
    mandatoryConsequence: 2,
    urgency: 2
  });
  let state = decideReplayBroadcastShot(
    createReplayBroadcastDirectorState(),
    { candidates: [a], policy: directorPolicy, nowMs: 0 }
  ).state;
  state = decideReplayBroadcastShot(
    state,
    { candidates: [a, b], policy: directorPolicy, nowMs: 100 }
  ).state;

  const immediate = decideReplayBroadcastShot(
    state,
    {
      candidates: [
        directorCandidate(1, 'BOARD', {
          mandatoryConsequence: 4,
          urgency: 4
        }),
        b
      ],
      policy: directorPolicy,
      nowMs: 200
    }
  );
  assert.equal(immediate.decision.reason, 'CONTINUE');
  assert.equal(immediate.decision.selectedCandidateId, b.candidateId);
  assert.equal(
    immediate.decision.considered.find(row => row.candidateId === a.candidateId)
      .cooldownBlocked,
    true
  );

  const afterCooldown = decideReplayBroadcastShot(
    immediate.state,
    {
      candidates: [
        directorCandidate(1, 'BOARD', {
          mandatoryConsequence: 4,
          urgency: 4
        }),
        b
      ],
      policy: directorPolicy,
      nowMs: 600
    }
  );
  assert.equal(afterCooldown.decision.reason, 'VALUE_SWITCH');
  assert.equal(afterCooldown.decision.selectedCandidateId, a.candidateId);
});

test('broadcast director clears a missing active shot without synthesizing replay state', () => {
  const a = directorCandidate(1, 'BOARD');
  const initial = decideReplayBroadcastShot(
    createReplayBroadcastDirectorState(),
    { candidates: [a], policy: directorPolicy, nowMs: 0 }
  );
  const cleared = decideReplayBroadcastShot(
    initial.state,
    { candidates: [], policy: directorPolicy, nowMs: 100 }
  );
  assert.equal(cleared.decision.reason, 'NO_CANDIDATE');
  assert.equal(cleared.decision.selectedCandidateId, null);
  assert.equal(cleared.state.activeCandidateId, null);
  assert.equal(cleared.state.activeSelectedAtMs, null);
  assert.equal(cleared.state.lastReleasedAtByCandidate[a.candidateId], 100);
});

function initialDirectorDecision() {
  const candidate = directorCandidate(1, 'BOARD');
  return decideReplayBroadcastShot(
    createReplayBroadcastDirectorState(),
    { candidates: [candidate], policy: directorPolicy, nowMs: 25 }
  ).decision;
}

test('player presentation projection maps the exact three authorized modes deterministically', () => {
  const decision = initialDirectorDecision();
  const expected = {
    'BOARD_PRIMARY+ANIM_WIPE': {
      primarySurface: 'BOARD',
      wipeSurface: 'ANIMATION',
      wipeEnabled: true
    },
    'ANIMATION_PRIMARY+BOARD_WIPE': {
      primarySurface: 'ANIMATION',
      wipeSurface: 'BOARD',
      wipeEnabled: true
    },
    'BOARD_ONLY(WIPE_OFF)': {
      primarySurface: 'BOARD',
      wipeSurface: null,
      wipeEnabled: false
    }
  };

  for (const [mode, layout] of Object.entries(expected)) {
    const first = projectReplayDirectorDecision(decision, { mode });
    const second = projectReplayDirectorDecision(decision, { mode });
    assert.deepEqual(first, second);
    assert.equal(first.schema, 'GAMEROAD_REPLAY_PLAYER_PRESENTATION_PROJECTION_V1');
    assert.equal(first.presentationOnly, true);
    assert.equal(first.mode, mode);
    assert.equal(first.decisionSerial, decision.serial);
    assert.equal(first.atMs, decision.atMs);
    assert.equal(first.reason, decision.reason);
    assert.equal(first.selectedCandidateId, decision.selectedCandidateId);
    assert.equal(first.selectedEventId, decision.selectedEventId);
    assert.equal(first.primarySurface, layout.primarySurface);
    assert.equal(first.wipeSurface, layout.wipeSurface);
    assert.equal(first.wipeEnabled, layout.wipeEnabled);
    assert.equal('selectedScore' in first, false);
    assert.equal('considered' in first, false);
    assert.equal('publicData' in first, false);
    assert.equal('privateData' in first, false);
    assert.equal('privateByViewer' in first, false);
    assert.equal('authorityOnly' in first, false);
    assert.equal(Object.isFrozen(first), true);
  }
});

test('player presentation projection fails closed for unknown or missing modes', () => {
  const decision = initialDirectorDecision();
  assert.throws(
    () => projectReplayDirectorDecision(decision),
    /DIRECTOR_PLAYER_MODE_INVALID/
  );
  assert.throws(
    () => projectReplayDirectorDecision(decision, { mode: 'AUTO' }),
    /DIRECTOR_PLAYER_MODE_INVALID/
  );
});

test('player presentation projection rejects invalid, secret-bearing, or identity-broken decisions', () => {
  const decision = initialDirectorDecision();
  const mode = 'BOARD_PRIMARY+ANIM_WIPE';
  assert.throws(
    () => projectReplayDirectorDecision({ ...decision, privateData: { secret: true } }, { mode }),
    /DIRECTOR_DECISION_NOT_PUBLIC_ONLY/
  );
  assert.throws(
    () => projectReplayDirectorDecision({ ...decision, presentationOnly: false }, { mode }),
    /DIRECTOR_DECISION_INVALID/
  );
  assert.throws(
    () => projectReplayDirectorDecision({ ...decision, selectedEventId: null }, { mode }),
    /DIRECTOR_DECISION_IDENTITY_INVALID/
  );
  assert.throws(
    () => projectReplayDirectorDecision({ ...decision, selectedScore: Infinity }, { mode }),
    /DIRECTOR_DECISION_SCORE_INVALID/
  );
});
