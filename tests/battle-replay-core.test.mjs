import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_REPLAY_CORE,
  appendAcceptedEvent,
  createReplayLog,
  readReplay,
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
