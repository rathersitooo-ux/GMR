import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HATE_PEER_PRESENCE_CORE,
  applyHatePeerPresenceEvent,
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
