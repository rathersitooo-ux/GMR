import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_2V2_CONTROL_MODES,
  BATTLE_2V2_RECONNECT_CORE,
  create2v2ReconnectState,
  disconnect2v2Player,
  expire2v2ReconnectGrace,
  isCurrent2v2ControlEnvelope,
  project2v2SeatControl,
  reconnect2v2Player
} from '../browser/battle-2v2-reconnect-core.mjs';

const seats = Object.freeze([
  Object.freeze({ seatId: 'P1', playerId: 'H1', teamId: 'A' }),
  Object.freeze({ seatId: 'P2', playerId: 'H2', teamId: 'A' }),
  Object.freeze({ seatId: 'P3', playerId: 'H3', teamId: 'B' }),
  Object.freeze({ seatId: 'P4', playerId: 'H4', teamId: 'B' })
]);

function freshState() {
  return create2v2ReconnectState({ seats });
}

function controlBySeat(state, seatId) {
  return project2v2SeatControl(state).seats.find(seat => seat.seatId === seatId);
}

function envelope(state, seatId) {
  const seat = controlBySeat(state, seatId);
  return Object.freeze({
    seatId,
    controlMode: seat.controlMode,
    controlGeneration: seat.controlGeneration
  });
}

test('schema and control vocabulary are stable and include permanent partner takeover', () => {
  assert.equal(BATTLE_2V2_RECONNECT_CORE.schema, 'GAMEROAD_BATTLE_2V2_RECONNECT_V1');
  assert.deepEqual(BATTLE_2V2_CONTROL_MODES, {
    SELF: 'self',
    TEMPORARY_PARTNER: 'temporary_partner',
    PERMANENT_PARTNER: 'permanent_partner',
    UNCONTROLLED: 'uncontrolled'
  });
  assert.equal(Object.isFrozen(BATTLE_2V2_CONTROL_MODES), true);
});

test('requires exactly two teams of two with unique seat and player identities', () => {
  assert.throws(() => create2v2ReconnectState({ seats: seats.slice(0, 3) }), /FOUR_SEATS_REQUIRED/);
  assert.throws(() => create2v2ReconnectState({ seats: [
    seats[0], seats[1], seats[2], { seatId: 'P4', playerId: 'H4', teamId: 'C' }
  ] }), /TWO_TEAMS_OF_TWO_REQUIRED/);
  assert.throws(() => create2v2ReconnectState({ seats: [
    seats[0], { seatId: 'P1', playerId: 'H2', teamId: 'A' }, seats[2], seats[3]
  ] }), /SEAT_ID_DUPLICATE/);
});

test('all connected humans begin in SELF generation zero and control only their own seats', () => {
  const state = freshState();
  const view = project2v2SeatControl(state);
  assert.equal(view.revision, 0);

  for (const seat of view.seats) {
    assert.equal(seat.connected, true);
    assert.equal(seat.controlMode, 'self');
    assert.equal(seat.controlGeneration, 0);
    assert.equal(seat.controllerSeatId, seat.seatId);
    assert.equal(seat.controllerPlayerId, seat.playerId);
    assert.equal(isCurrent2v2ControlEnvelope(state, envelope(state, seat.seatId)), true);
  }
});

test('accidental disconnect immediately hands only that seat to temporary_partner generation one', () => {
  const before = freshState();
  const staleHumanEnvelope = envelope(before, 'P1');
  const disconnected = disconnect2v2Player(before, 'H1');

  assert.deepEqual(
    { ok: disconnected.ok, status: disconnected.status, changed: disconnected.changed },
    { ok: true, status: 'disconnected', changed: true }
  );
  assert.equal(disconnected.state.revision, 1);

  const p1 = controlBySeat(disconnected.state, 'P1');
  const p2 = controlBySeat(disconnected.state, 'P2');
  assert.equal(p1.playerId, 'H1');
  assert.equal(p1.connected, false);
  assert.equal(p1.controlMode, 'temporary_partner');
  assert.equal(p1.controlGeneration, 1);
  assert.equal(p1.controllerSeatId, null);
  assert.equal(p1.controllerPlayerId, null);
  assert.equal(p2.controlMode, 'self');
  assert.equal(p2.controlGeneration, 0);
  assert.equal(p2.controllerPlayerId, 'H2');

  assert.equal(isCurrent2v2ControlEnvelope(disconnected.state, staleHumanEnvelope), false);
  assert.equal(isCurrent2v2ControlEnvelope(disconnected.state, envelope(disconnected.state, 'P1')), true);
});

test('duplicate disconnect is idempotent and does not advance revision or generation', () => {
  const once = disconnect2v2Player(freshState(), 'H1');
  const twice = disconnect2v2Player(once.state, 'H1');

  assert.equal(twice.status, 'unchanged');
  assert.equal(twice.changed, false);
  assert.equal(twice.state, once.state);
  assert.equal(twice.state.revision, 1);
  assert.equal(controlBySeat(twice.state, 'P1').controlGeneration, 1);
});

test('in-grace reconnect restores the same human SELF and rejects the stale temporary AI envelope', () => {
  const disconnected = disconnect2v2Player(freshState(), 'H1').state;
  const stalePartnerEnvelope = envelope(disconnected, 'P1');
  const reconnected = reconnect2v2Player(disconnected, 'H1');

  assert.equal(reconnected.status, 'reconnected');
  assert.equal(reconnected.state.revision, 2);

  const p1 = controlBySeat(reconnected.state, 'P1');
  assert.equal(p1.connected, true);
  assert.equal(p1.controlMode, 'self');
  assert.equal(p1.controlGeneration, 2);
  assert.equal(p1.playerId, 'H1');
  assert.equal(p1.controllerPlayerId, 'H1');
  assert.equal(isCurrent2v2ControlEnvelope(reconnected.state, stalePartnerEnvelope), false);
  assert.equal(isCurrent2v2ControlEnvelope(reconnected.state, envelope(reconnected.state, 'P1')), true);
});

test('duplicate reconnect is idempotent after the human already recovered control', () => {
  const disconnected = disconnect2v2Player(freshState(), 'H1').state;
  const once = reconnect2v2Player(disconnected, 'H1');
  const twice = reconnect2v2Player(once.state, 'H1');

  assert.equal(twice.status, 'unchanged');
  assert.equal(twice.changed, false);
  assert.equal(twice.state, once.state);
  assert.equal(twice.state.revision, 2);
  assert.equal(controlBySeat(twice.state, 'P1').controlGeneration, 2);
});

test('authoritative grace expiry changes only temporary_partner to permanent_partner and increments generation', () => {
  const disconnected = disconnect2v2Player(freshState(), 'H1').state;
  const staleTemporaryEnvelope = envelope(disconnected, 'P1');
  const expired = expire2v2ReconnectGrace(disconnected, 'H1');

  assert.equal(expired.ok, true);
  assert.equal(expired.status, 'permanent_partner');
  assert.equal(expired.changed, true);
  assert.equal(expired.state.revision, 2);

  const p1 = controlBySeat(expired.state, 'P1');
  const p2 = controlBySeat(expired.state, 'P2');
  assert.equal(p1.connected, false);
  assert.equal(p1.controlMode, 'permanent_partner');
  assert.equal(p1.controlGeneration, 2);
  assert.equal(p1.controllerSeatId, null);
  assert.equal(p1.controllerPlayerId, null);
  assert.equal(p2.controlMode, 'self');
  assert.equal(p2.controlGeneration, 0);

  assert.equal(isCurrent2v2ControlEnvelope(expired.state, staleTemporaryEnvelope), false);
  assert.equal(isCurrent2v2ControlEnvelope(expired.state, envelope(expired.state, 'P1')), true);
});

test('reconnect after permanent_partner fails closed without mutating authority state', () => {
  const permanent = expire2v2ReconnectGrace(
    disconnect2v2Player(freshState(), 'H1').state,
    'H1'
  ).state;
  const result = reconnect2v2Player(permanent, 'H1');

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'PERMANENT_PARTNER_LOCKED');
  assert.equal(result.changed, false);
  assert.equal(result.state, permanent);
  assert.equal(controlBySeat(result.state, 'P1').controlGeneration, 2);
});

test('duplicate expiry is idempotent and expiry without an active grace window fails closed', () => {
  const state = freshState();
  const notDisconnected = expire2v2ReconnectGrace(state, 'H1');
  assert.equal(notDisconnected.ok, false);
  assert.equal(notDisconnected.reason, 'GRACE_NOT_ACTIVE');
  assert.equal(notDisconnected.changed, false);
  assert.equal(notDisconnected.state, state);

  const permanent = expire2v2ReconnectGrace(
    disconnect2v2Player(state, 'H1').state,
    'H1'
  );
  const duplicate = expire2v2ReconnectGrace(permanent.state, 'H1');
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.status, 'unchanged');
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.state, permanent.state);
  assert.equal(duplicate.state.revision, 2);
});

test('both teammates can be proxied independently without transferring either seat to the other human', () => {
  let state = disconnect2v2Player(freshState(), 'H1').state;
  state = disconnect2v2Player(state, 'H2').state;

  const p1 = controlBySeat(state, 'P1');
  const p2 = controlBySeat(state, 'P2');
  assert.equal(p1.controlMode, 'temporary_partner');
  assert.equal(p2.controlMode, 'temporary_partner');
  assert.equal(p1.controlGeneration, 1);
  assert.equal(p2.controlGeneration, 1);
  assert.equal(p1.controllerPlayerId, null);
  assert.equal(p2.controllerPlayerId, null);
  assert.equal(controlBySeat(state, 'P3').controllerPlayerId, 'H3');
  assert.equal(controlBySeat(state, 'P4').controllerPlayerId, 'H4');

  state = reconnect2v2Player(state, 'H1').state;
  assert.equal(controlBySeat(state, 'P1').controllerPlayerId, 'H1');
  assert.equal(controlBySeat(state, 'P1').controlGeneration, 2);
  assert.equal(controlBySeat(state, 'P2').controlMode, 'temporary_partner');
  assert.equal(controlBySeat(state, 'P2').controlGeneration, 1);
});

test('current-envelope guard fails closed for malformed, unknown, stale, and uncontrolled envelopes', () => {
  const state = disconnect2v2Player(freshState(), 'H1').state;
  const valid = envelope(state, 'P1');

  assert.equal(isCurrent2v2ControlEnvelope(state, valid), true);
  assert.equal(isCurrent2v2ControlEnvelope(state, null), false);
  assert.equal(isCurrent2v2ControlEnvelope(state, []), false);
  assert.equal(isCurrent2v2ControlEnvelope(state, { ...valid, seatId: 'UNKNOWN' }), false);
  assert.equal(isCurrent2v2ControlEnvelope(state, { ...valid, controlMode: 'bogus' }), false);
  assert.equal(isCurrent2v2ControlEnvelope(state, { ...valid, controlGeneration: -1 }), false);
  assert.equal(isCurrent2v2ControlEnvelope(state, { ...valid, controlGeneration: 0 }), false);
  assert.equal(isCurrent2v2ControlEnvelope(state, {
    seatId: 'P1',
    controlMode: 'uncontrolled',
    controlGeneration: 1
  }), false);
});

test('unknown or invalid players fail closed without state mutation', () => {
  const state = freshState();
  for (const result of [
    disconnect2v2Player(state, 'UNKNOWN'),
    reconnect2v2Player(state, ''),
    expire2v2ReconnectGrace(state, 'UNKNOWN')
  ]) {
    assert.equal(result.ok, false);
    assert.equal(result.changed, false);
    assert.equal(result.state, state);
  }
  assert.equal(state.revision, 0);
});

test('state and projections are deeply frozen and contain no timer, outcome, partner identity, or teammate proxy policy', () => {
  let state = disconnect2v2Player(freshState(), 'H1').state;
  state = expire2v2ReconnectGrace(state, 'H1').state;
  const view = project2v2SeatControl(state);

  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.seats), true);
  assert.equal(Object.isFrozen(view), true);
  assert.equal(Object.isFrozen(view.seats), true);
  assert.equal(Object.isFrozen(view.seats[0]), true);

  const encoded = JSON.stringify({ state, view });
  for (const forbidden of [
    'winner', 'forfeit', 'rating', 'reward',
    'graceMs', 'graceSeconds', 'deadline', 'partnerId'
  ]) {
    assert.equal(encoded.includes(forbidden), false);
  }

  assert.equal(controlBySeat(state, 'P1').controllerPlayerId, null);
  assert.equal(controlBySeat(state, 'P2').controllerPlayerId, 'H2');
});
