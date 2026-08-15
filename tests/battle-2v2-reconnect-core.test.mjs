import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_2V2_CONTROL_MODES,
  BATTLE_2V2_RECONNECT_CORE,
  create2v2ReconnectState,
  disconnect2v2Player,
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

test('schema and control vocabulary are stable', () => {
  assert.equal(BATTLE_2V2_RECONNECT_CORE.schema, 'GAMEROAD_BATTLE_2V2_RECONNECT_V1');
  assert.deepEqual(BATTLE_2V2_CONTROL_MODES, {
    SELF: 'self',
    TEMPORARY_PARTNER: 'temporary_partner',
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

test('all connected humans control only their own seats initially', () => {
  const view = project2v2SeatControl(freshState());
  assert.equal(view.revision, 0);
  for (const seat of view.seats) {
    assert.equal(seat.connected, true);
    assert.equal(seat.controlMode, 'self');
    assert.equal(seat.controllerSeatId, seat.seatId);
    assert.equal(seat.controllerPlayerId, seat.playerId);
  }
});

test('partner disconnect does not transfer seat-operation control to the connected teammate during grace', () => {
  const disconnected = disconnect2v2Player(freshState(), 'H1');
  assert.deepEqual(
    { ok: disconnected.ok, status: disconnected.status, changed: disconnected.changed },
    { ok: true, status: 'disconnected', changed: true }
  );

  const p1 = controlBySeat(disconnected.state, 'P1');
  const p2 = controlBySeat(disconnected.state, 'P2');
  const p3 = controlBySeat(disconnected.state, 'P3');
  const p4 = controlBySeat(disconnected.state, 'P4');
  assert.equal(p1.playerId, 'H1');
  assert.equal(p1.connected, false);
  assert.equal(p1.controlMode, 'uncontrolled');
  assert.equal(p1.controllerSeatId, null);
  assert.equal(p1.controllerPlayerId, null);
  assert.equal(p2.controlMode, 'self');
  assert.equal(p2.controllerPlayerId, 'H2');
  assert.equal(p3.controllerPlayerId, 'H3');
  assert.equal(p4.controllerPlayerId, 'H4');
});

test('reconnect returns the seat to the same human identity', () => {
  const disconnected = disconnect2v2Player(freshState(), 'H1').state;
  const reconnected = reconnect2v2Player(disconnected, 'H1');
  const p1 = controlBySeat(reconnected.state, 'P1');

  assert.equal(reconnected.status, 'reconnected');
  assert.equal(reconnected.state.revision, 2);
  assert.equal(p1.connected, true);
  assert.equal(p1.controlMode, 'self');
  assert.equal(p1.playerId, 'H1');
  assert.equal(p1.controllerPlayerId, 'H1');
});

test('duplicate disconnect and reconnect are idempotent and do not advance revision', () => {
  const once = disconnect2v2Player(freshState(), 'H1');
  const twice = disconnect2v2Player(once.state, 'H1');
  assert.equal(twice.status, 'unchanged');
  assert.equal(twice.changed, false);
  assert.equal(twice.state, once.state);
  assert.equal(twice.state.revision, 1);

  const back = reconnect2v2Player(twice.state, 'H1');
  const backAgain = reconnect2v2Player(back.state, 'H1');
  assert.equal(backAgain.status, 'unchanged');
  assert.equal(backAgain.state, back.state);
  assert.equal(backAgain.state.revision, 2);
});

test('when both teammates are disconnected neither seat receives an illegal controller', () => {
  let state = disconnect2v2Player(freshState(), 'H1').state;
  state = disconnect2v2Player(state, 'H2').state;

  for (const seatId of ['P1', 'P2']) {
    const control = controlBySeat(state, seatId);
    assert.equal(control.connected, false);
    assert.equal(control.controlMode, 'uncontrolled');
    assert.equal(control.controllerSeatId, null);
    assert.equal(control.controllerPlayerId, null);
  }
  assert.equal(controlBySeat(state, 'P3').controllerPlayerId, 'H3');
  assert.equal(controlBySeat(state, 'P4').controllerPlayerId, 'H4');
});

test('one teammate reconnecting restores only self control while the still-disconnected teammate remains uncontrolled', () => {
  let state = disconnect2v2Player(freshState(), 'H1').state;
  state = disconnect2v2Player(state, 'H2').state;
  state = reconnect2v2Player(state, 'H1').state;

  const p1 = controlBySeat(state, 'P1');
  const p2 = controlBySeat(state, 'P2');
  assert.equal(p1.controlMode, 'self');
  assert.equal(p1.controllerPlayerId, 'H1');
  assert.equal(p2.playerId, 'H2');
  assert.equal(p2.connected, false);
  assert.equal(p2.controlMode, 'uncontrolled');
  assert.equal(p2.controllerSeatId, null);
  assert.equal(p2.controllerPlayerId, null);
});

test('unknown or invalid player fails closed without state mutation', () => {
  const state = freshState();
  for (const result of [
    disconnect2v2Player(state, 'UNKNOWN'),
    reconnect2v2Player(state, '')
  ]) {
    assert.equal(result.ok, false);
    assert.equal(result.changed, false);
    assert.equal(result.state, state);
  }
  assert.equal(state.revision, 0);
});

test('state and projections are deeply frozen and contain no inferred teammate proxy, outcome, or timer policy', () => {
  const state = disconnect2v2Player(freshState(), 'H1').state;
  const view = project2v2SeatControl(state);
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.seats), true);
  assert.equal(Object.isFrozen(view), true);
  assert.equal(Object.isFrozen(view.seats), true);
  assert.equal(Object.isFrozen(view.seats[0]), true);

  const encoded = JSON.stringify({ state, view });
  for (const forbidden of ['temporary_partner', 'winner', 'forfeit', 'rating', 'reward', 'graceMs', 'graceSeconds', 'permanent_partner']) {
    assert.equal(encoded.includes(forbidden), false);
  }
});
