import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HATE1000_PRESENTATION_MOTION_CORE,
  HATE_PEER_PRESENCE_CORE,
  applyHate1000PresentationEvent,
  applyHatePeerPresenceEvent,
  createHate1000PresentationSession,
  createHatePeerPresenceState,
  projectHateHumanWaitSourceEligibility
} from '../browser/hate-peer-presence-core.mjs';

function currentState(overrides = {}) {
  return createHatePeerPresenceState({
    peerId: 'P2-human',
    sessionId: 'session-current',
    revision: 10,
    connected: true,
    ...overrides
  });
}

function event(kind, revision, overrides = {}) {
  return {
    kind,
    peerId: 'P2-human',
    sessionId: 'session-current',
    revision,
    ...overrides
  };
}

test('schema and authoritative event vocabulary are stable', () => {
  assert.equal(HATE_PEER_PRESENCE_CORE.schema, 'GAMEROAD_HATE_PEER_PRESENCE_V1');
  assert.deepEqual(HATE_PEER_PRESENCE_CORE.eventKinds, {
    DISCONNECT: 'disconnect',
    REJOIN: 'rejoin',
    SYNC: 'sync'
  });
  assert.equal(Object.isFrozen(HATE_PEER_PRESENCE_CORE.eventKinds), true);
});

test('authoritative connected snapshot is an eligible real-human wait source', () => {
  const state = currentState();
  const projection = projectHateHumanWaitSourceEligibility(state);
  assert.equal(projection.eligible, true);
  assert.equal(projection.peerId, 'P2-human');
  assert.equal(projection.sessionId, 'session-current');
  assert.equal(projection.revision, 10);
});

test('unexpected authoritative disconnect immediately makes the human wait source ineligible', () => {
  const result = applyHatePeerPresenceEvent(currentState(), event('disconnect', 11));
  assert.equal(result.ok, true);
  assert.equal(result.state.connected, false);
  assert.equal(result.state.revision, 11);
  assert.equal(projectHateHumanWaitSourceEligibility(result.state).eligible, false);
});

test('only a newer authoritative current-session rejoin restores eligibility', () => {
  const disconnected = applyHatePeerPresenceEvent(currentState(), event('disconnect', 11)).state;
  const rejoined = applyHatePeerPresenceEvent(disconnected, event('rejoin', 12));
  assert.equal(rejoined.ok, true);
  assert.equal(rejoined.state.connected, true);
  assert.equal(rejoined.state.revision, 12);
  assert.equal(projectHateHumanWaitSourceEligibility(rejoined.state).eligible, true);
});

test('newer authoritative current-session sync can restore eligibility', () => {
  const disconnected = currentState({ revision: 20, connected: false });
  const synced = applyHatePeerPresenceEvent(disconnected, event('sync', 21));
  assert.equal(synced.ok, true);
  assert.equal(synced.state.connected, true);
  assert.equal(projectHateHumanWaitSourceEligibility(synced.state).eligible, true);
});

test('duplicate and stale revisions fail closed without state mutation', () => {
  const state = currentState({ revision: 30, connected: false });
  for (const candidate of [event('rejoin', 30), event('rejoin', 29)]) {
    const result = applyHatePeerPresenceEvent(state, candidate);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'EVENT_STALE_OR_DUPLICATE');
    assert.equal(result.changed, false);
    assert.equal(result.state, state);
    assert.equal(projectHateHumanWaitSourceEligibility(result.state).eligible, false);
  }
});

test('an event from an old session cannot overwrite the authoritative current session', () => {
  const state = currentState({ revision: 40, connected: false });
  const result = applyHatePeerPresenceEvent(state, event('rejoin', 41, { sessionId: 'session-old' }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'EVENT_SESSION_MISMATCH');
  assert.equal(result.state, state);
  assert.equal(projectHateHumanWaitSourceEligibility(result.state).eligible, false);
});

test('wrong peer identity fails closed even with a newer revision', () => {
  const state = currentState({ revision: 50, connected: false });
  const result = applyHatePeerPresenceEvent(state, event('rejoin', 51, { peerId: 'P3-human' }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'EVENT_PEER_MISMATCH');
  assert.equal(result.state, state);
});

test('transport-open-only and malformed events are not authoritative presence restoration', () => {
  const state = currentState({ revision: 60, connected: false });
  const opened = applyHatePeerPresenceEvent(state, event('open', 61));
  assert.equal(opened.ok, false);
  assert.equal(opened.reason, 'EVENT_KIND_INVALID');
  assert.equal(opened.state, state);

  const extra = applyHatePeerPresenceEvent(state, { ...event('rejoin', 61), socketReadyState: 1 });
  assert.equal(extra.ok, false);
  assert.equal(extra.reason, 'EVENT_SHAPE_INVALID');
  assert.equal(extra.state, state);
});

test('newer repeated disconnect advances authority revision so an older rejoin cannot revive presence', () => {
  const state = currentState({ revision: 70, connected: false });
  const newerDisconnect = applyHatePeerPresenceEvent(state, event('disconnect', 72));
  assert.equal(newerDisconnect.ok, true);
  assert.equal(newerDisconnect.state.connected, false);
  assert.equal(newerDisconnect.state.revision, 72);

  const lateRejoin = applyHatePeerPresenceEvent(newerDisconnect.state, event('rejoin', 71));
  assert.equal(lateRejoin.ok, false);
  assert.equal(lateRejoin.reason, 'EVENT_STALE_OR_DUPLICATE');
  assert.equal(projectHateHumanWaitSourceEligibility(lateRejoin.state).eligible, false);
});

test('snapshot and event inputs are not mutated; state, results, and projections are deeply frozen', () => {
  const snapshot = { peerId: 'P2-human', sessionId: 'session-current', revision: 80, connected: true };
  const authoritativeEvent = event('disconnect', 81);
  const snapshotBefore = structuredClone(snapshot);
  const eventBefore = structuredClone(authoritativeEvent);

  const state = createHatePeerPresenceState(snapshot);
  const result = applyHatePeerPresenceEvent(state, authoritativeEvent);
  const projection = projectHateHumanWaitSourceEligibility(result.state);

  assert.deepEqual(snapshot, snapshotBefore);
  assert.deepEqual(authoritativeEvent, eventBefore);
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.state), true);
  assert.equal(Object.isFrozen(projection), true);
});

test('invalid authoritative snapshots fail closed at construction', () => {
  assert.throws(() => createHatePeerPresenceState({
    peerId: 'P2-human', sessionId: 'session-current', revision: 1, connected: true, extra: 'no'
  }), /SNAPSHOT_SHAPE_INVALID/);
  assert.throws(() => createHatePeerPresenceState({
    peerId: '', sessionId: 'session-current', revision: 1, connected: true
  }), /SNAPSHOT_PEER_INVALID/);
  assert.throws(() => createHatePeerPresenceState({
    peerId: 'P2-human', sessionId: 'session-current', revision: -1, connected: true
  }), /SNAPSHOT_REVISION_INVALID/);
});

test('technical presence outputs contain no timer, outcome, takeover, reward, or save policy', () => {
  const state = applyHatePeerPresenceEvent(currentState(), event('disconnect', 11)).state;
  const encoded = JSON.stringify({
    state,
    projection: projectHateHumanWaitSourceEligibility(state),
    contract: HATE_PEER_PRESENCE_CORE
  });
  for (const forbidden of [
    'hateTime', 'remainingTime', 'quick', 'grace', 'winner', 'forfeit',
    'temporary_partner', 'permanent_partner', 'reward', 'rating', 'save', 'cardId'
  ]) {
    assert.equal(encoded.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  }
});

function hate1000Event(overrides = {}) {
  return {
    sessionId: 'presentation-session',
    eventId: 'hate1000-event-1',
    kind: 'hate1000_explosion',
    authorized: true,
    ...overrides
  };
}

test('HATE1000 motion plan stays inside the R7 finite timing window and primary-read budget', () => {
  const state = createHate1000PresentationSession({ sessionId: 'presentation-session' });
  const result = applyHate1000PresentationEvent(state, hate1000Event());
  assert.equal(result.accepted, true);
  assert.equal(result.duplicate, false);
  assert.equal(result.plan.mode, 'motion');
  assert.equal(result.plan.presentationOnly, true);
  assert.equal(result.plan.oneShot, true);
  assert.equal(result.plan.layoutAuthority, false);
  assert.equal(result.plan.assetAuthority, 'unbound_candidate');

  const timing = result.plan.motion;
  assert.equal(timing.durationMs >= 420 && timing.durationMs <= 520, true);
  assert.equal(timing.primaryReadDeadlineMs <= timing.durationMs * 0.25, true);
  assert.deepEqual(timing.markers, {
    onsetMs: 0,
    peakMs: 60,
    ringBurstEndMs: 120,
    decayEndMs: 260,
    tailEndMs: 480
  });
  assert.equal(timing.markers.onsetMs <= timing.markers.peakMs, true);
  assert.equal(timing.markers.peakMs <= timing.markers.ringBurstEndMs, true);
  assert.equal(timing.markers.ringBurstEndMs <= timing.markers.decayEndMs, true);
  assert.equal(timing.markers.decayEndMs <= timing.markers.tailEndMs, true);
  assert.equal(timing.markers.tailEndMs, timing.durationMs);
  assert.equal(timing.singlePeak, true);
  assert.equal(timing.monotonicAfterPeak, true);
});

test('reduced-motion, low-performance, and disabled-animation modes preserve a static meaning-bearing plan', () => {
  for (const preferences of [
    { reducedMotion: true },
    { lowPerf: true },
    { animationEnabled: false }
  ]) {
    const state = createHate1000PresentationSession({ sessionId: 'presentation-session' });
    const result = applyHate1000PresentationEvent(state, hate1000Event(), preferences);
    assert.equal(result.accepted, true);
    assert.equal(result.plan.mode, 'static');
    assert.equal(result.plan.motion, null);
    assert.equal(result.plan.static.retainMeaning, true);
  }
});

test('duplicate HATE1000 presentation events are idempotent and never replay', () => {
  const state = createHate1000PresentationSession({ sessionId: 'presentation-session' });
  const first = applyHate1000PresentationEvent(state, hate1000Event());
  const duplicate = applyHate1000PresentationEvent(first.state, hate1000Event());
  assert.equal(first.accepted, true);
  assert.equal(duplicate.accepted, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.reason, 'HATE1000_DUPLICATE_EVENT');
  assert.equal(duplicate.plan, null);
  assert.equal(duplicate.state, first.state);
});

test('HATE1000 presentation input fails closed on malformed, mismatched, unauthorized, or wrong-kind events', () => {
  const state = createHate1000PresentationSession({ sessionId: 'presentation-session' });
  const cases = [
    [{ ...hate1000Event(), extra: true }, 'HATE1000_EVENT_SHAPE_INVALID'],
    [hate1000Event({ sessionId: 'other-session' }), 'HATE1000_SESSION_MISMATCH'],
    [hate1000Event({ authorized: false }), 'HATE1000_NOT_AUTHORIZED'],
    [hate1000Event({ kind: 'other' }), 'HATE1000_KIND_INVALID']
  ];
  for (const [candidate, expected] of cases) {
    const result = applyHate1000PresentationEvent(state, candidate);
    assert.equal(result.accepted, false);
    assert.equal(result.reason, expected);
    assert.equal(result.state, state);
  }
});

test('HATE1000 presentation namespace remains deeply frozen and contains no gameplay authority fields', () => {
  const state = createHate1000PresentationSession({ sessionId: 'presentation-session' });
  const result = applyHate1000PresentationEvent(state, hate1000Event());
  assert.equal(Object.isFrozen(HATE1000_PRESENTATION_MOTION_CORE), true);
  assert.equal(Object.isFrozen(HATE1000_PRESENTATION_MOTION_CORE.timing), true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.plan), true);
  assert.equal(Object.isFrozen(result.state), true);

  const encoded = JSON.stringify({ contract: HATE1000_PRESENTATION_MOTION_CORE, result });
  for (const forbidden of [
    'hateTime', 'remainingTime', 'quick', 'threshold', 'winner', 'reward',
    'rating', 'save', 'cardId', 'temporary_partner', 'permanent_partner'
  ]) {
    assert.equal(encoded.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  }
});
