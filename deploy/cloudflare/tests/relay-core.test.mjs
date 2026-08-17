import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WS_WIRE,
  TRANSPORT_PRESENCE_TYPE,
  admitConnection,
  emptyRoom,
  makeTransportPresenceFrame,
  routeFrame,
} from '../relay/src/relay-core.mjs';

const channel = 'gameroad.friend.r2.ABCDEFG';
const host = { channel, code: 'ABCDEFG', role: 'host', clientId: 'host-1', authToken: '' };
const guest = (id, authToken = '') => ({ channel, code: 'ABCDEFG', role: 'guest', clientId: id, authToken });
const active = (...xs) => xs;
const frame = (payload) => ({ wire: WS_WIRE, op: 'data', payload: { code: 'ABCDEFG', ...payload } });

function roomWithHost() {
  return admitConnection(emptyRoom(), host).room;
}

function admitGuest(room, id, auth = '') {
  return admitConnection(room, guest(id, auth)).room;
}

test('admits one host and rejects a second host identity', () => {
  const room = roomWithHost();
  assert.equal(admitConnection(room, { ...host, clientId: 'host-2' }).reason, 'host_exists');
});

test('caps transport at three guest identities for four total players', () => {
  let room = roomWithHost();
  room = admitGuest(room, 'g1');
  room = admitGuest(room, 'g2');
  room = admitGuest(room, 'g3');
  assert.equal(admitConnection(room, guest('g4')).reason, 'room_full');
});

test('host payload requires explicit recipient', () => {
  const room = admitGuest(roomWithHost(), 'g1');
  const result = routeFrame(room, host, frame({ type: 'lobby' }), active(host, guest('g1')));
  assert.equal(result.reason, 'host_target_required');
});

test('host routes to exactly one recipient and binds accept auth token', () => {
  const room = admitGuest(roomWithHost(), 'g1');
  const result = routeFrame(room, host, frame({ type: 'accept', to: 'g1', authToken: 'auth-1' }), active(host, guest('g1')));
  assert.equal(result.ok, true);
  assert.deepEqual(result.targets, ['g1']);
  assert.equal(result.room.guests.g1.authToken, 'auth-1');
  assert.equal(result.bindAuthToken, 'auth-1');
});

test('guest can send only to host and clientId must match transport identity', () => {
  const room = admitGuest(roomWithHost(), 'g1');
  const result = routeFrame(room, guest('g1'), frame({ type: 'join', clientId: 'forged', authToken: '', seq: 1 }), active(host, guest('g1')));
  assert.equal(result.reason, 'transport_client_mismatch');
});

test('guest frame requires a positive integer seq', () => {
  const room = admitGuest(roomWithHost(), 'g1');
  const result = routeFrame(room, guest('g1'), frame({ type: 'join', clientId: 'g1', authToken: '', seq: 0 }), active(host, guest('g1')));
  assert.equal(result.reason, 'transport_seq_invalid');
});

test('payload room code cannot cross a Durable Object room', () => {
  const room = admitGuest(roomWithHost(), 'g1');
  const result = routeFrame(room, guest('g1'), { wire: WS_WIRE, op: 'data', payload: { code: 'HJKLMNP', type: 'join', clientId: 'g1', authToken: '', seq: 1 } }, active(host, guest('g1')));
  assert.equal(result.reason, 'transport_room_mismatch');
});

test('host-established auth token rejects a bad reconnect without replacing active identity', () => {
  let room = admitGuest(roomWithHost(), 'g1');
  room = routeFrame(room, host, frame({ type: 'accept', to: 'g1', authToken: 'auth-1' }), active(host, guest('g1'))).room;
  const bad = admitConnection(room, guest('g1', 'wrong'), active(host, guest('g1', 'auth-1')));
  assert.equal(bad.reason, 'transport_auth_mismatch');
  assert.equal(bad.room.guests.g1.authToken, 'auth-1');
});

test('correct reconnect may replace the old socket only after auth validation', () => {
  let room = admitGuest(roomWithHost(), 'g1');
  room.guests.g1.authToken = 'auth-1';
  const ok = admitConnection(room, guest('g1', 'auth-1'), active(host, guest('g1', 'auth-1')));
  assert.equal(ok.ok, true);
  assert.equal(ok.replaceClientId, 'g1');
});

test('guest auth must match the token bound by host accept', () => {
  let room = admitGuest(roomWithHost(), 'g1');
  room.guests.g1.authToken = 'auth-1';
  const result = routeFrame(room, guest('g1', 'auth-1'), frame({ type: 'sync', clientId: 'g1', authToken: 'wrong', seq: 2 }), active(host, guest('g1', 'auth-1')));
  assert.equal(result.reason, 'transport_auth_mismatch');
});

test('guest leave is routed to host then marks its transport identity removable', () => {
  const room = admitGuest(roomWithHost(), 'g1');
  const result = routeFrame(room, guest('g1'), frame({ type: 'leave', clientId: 'g1', authToken: '', seq: 2 }), active(host, guest('g1')));
  assert.equal(result.ok, true);
  assert.deepEqual(result.targets, ['host-1']);
  assert.equal(result.removeGuestAfterSend, 'g1');
});

test('unknown wire/op fails closed', () => {
  const room = roomWithHost();
  const result = routeFrame(room, host, { wire: 'wrong', op: 'data', payload: {} }, active(host));
  assert.equal(result.reason, 'transport_frame_invalid');
});

test('server-only transport presence frame carries exact reconnect/disconnect authority', () => {
  assert.deepEqual(makeTransportPresenceFrame('ABCDEFG', 'g1', 'rejoin'), {
    wire: WS_WIRE,
    op: 'data',
    payload: {
      v: 2,
      code: 'ABCDEFG',
      type: TRANSPORT_PRESENCE_TYPE,
      clientId: 'g1',
      kind: 'rejoin',
    },
  });
  assert.equal(makeTransportPresenceFrame('ABCDEFG', 'g1', 'disconnect').payload.kind, 'disconnect');
  assert.equal(makeTransportPresenceFrame('ABCDEFG', 'g1', 'sync').payload.kind, 'sync');
});

test('application payload cannot spoof reserved transport presence', () => {
  const room = admitGuest(roomWithHost(), 'g1');
  const result = routeFrame(
    room,
    guest('g1'),
    frame({ type: TRANSPORT_PRESENCE_TYPE, clientId: 'g1', kind: 'disconnect', seq: 7 }),
    active(host, guest('g1')),
  );
  assert.equal(result.reason, 'transport_presence_reserved');
});

test('transport presence builder rejects malformed identity and kind', () => {
  assert.throws(() => makeTransportPresenceFrame('bad', 'g1', 'disconnect'), /TRANSPORT_PRESENCE_CODE_INVALID/);
  assert.throws(() => makeTransportPresenceFrame('ABCDEFG', '', 'disconnect'), /TRANSPORT_PRESENCE_CLIENT_INVALID/);
  assert.throws(() => makeTransportPresenceFrame('ABCDEFG', 'g1', 'open'), /TRANSPORT_PRESENCE_KIND_INVALID/);
});
