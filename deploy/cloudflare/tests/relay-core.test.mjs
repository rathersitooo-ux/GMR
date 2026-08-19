import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  WS_WIRE,
  TRANSPORT_PRESENCE_TYPE,
  admitConnection,
  bumpGuestPresenceRevision,
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

test('correct reconnect may replace the old socket only after auth validation and advances authoritative presence revision', () => {
  let room = admitGuest(roomWithHost(), 'g1');
  room.guests.g1.authToken = 'auth-1';
  assert.equal(room.guests.g1.presenceRevision, 1);
  const ok = admitConnection(room, guest('g1', 'auth-1'), active(host, guest('g1', 'auth-1')));
  assert.equal(ok.ok, true);
  assert.equal(ok.replaceClientId, 'g1');
  assert.equal(ok.presenceRevision, 2);
  assert.equal(ok.room.guests.g1.presenceRevision, 2);
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

test('server-only transport presence frame carries exact session and revision authority', () => {
  assert.deepEqual(makeTransportPresenceFrame('ABCDEFG', 'g1', `${channel}:g1`, 3, 'rejoin'), {
    wire: WS_WIRE,
    op: 'data',
    payload: {
      v: 2,
      code: 'ABCDEFG',
      type: TRANSPORT_PRESENCE_TYPE,
      clientId: 'g1',
      sessionId: `${channel}:g1`,
      revision: 3,
      kind: 'rejoin',
    },
  });
  assert.equal(makeTransportPresenceFrame('ABCDEFG', 'g1', `${channel}:g1`, 4, 'disconnect').payload.kind, 'disconnect');
  assert.equal(makeTransportPresenceFrame('ABCDEFG', 'g1', `${channel}:g1`, 5, 'sync').payload.revision, 5);
});

test('application payload cannot spoof reserved transport presence', () => {
  const room = admitGuest(roomWithHost(), 'g1');
  const result = routeFrame(
    room,
    guest('g1'),
    frame({ type: TRANSPORT_PRESENCE_TYPE, clientId: 'g1', sessionId: 'forged', revision: 999, kind: 'disconnect', seq: 7 }),
    active(host, guest('g1')),
  );
  assert.equal(result.reason, 'transport_presence_reserved');
});

test('transport presence builder rejects malformed identity, session, revision and kind', () => {
  assert.throws(() => makeTransportPresenceFrame('bad', 'g1', 's', 1, 'disconnect'), /TRANSPORT_PRESENCE_CODE_INVALID/);
  assert.throws(() => makeTransportPresenceFrame('ABCDEFG', '', 's', 1, 'disconnect'), /TRANSPORT_PRESENCE_CLIENT_INVALID/);
  assert.throws(() => makeTransportPresenceFrame('ABCDEFG', 'g1', '', 1, 'disconnect'), /TRANSPORT_PRESENCE_SESSION_INVALID/);
  assert.throws(() => makeTransportPresenceFrame('ABCDEFG', 'g1', 's', 0, 'disconnect'), /TRANSPORT_PRESENCE_REVISION_INVALID/);
  assert.throws(() => makeTransportPresenceFrame('ABCDEFG', 'g1', 's', 1, 'open'), /TRANSPORT_PRESENCE_KIND_INVALID/);
});

test('presence revision bump is monotonic and preserves auth state', () => {
  const room = admitGuest(roomWithHost(), 'g1', 'auth-1');
  assert.equal(room.guests.g1.presenceRevision, 1);
  const next = bumpGuestPresenceRevision(room, 'g1');
  assert.equal(next.ok, true);
  assert.equal(next.revision, 2);
  assert.equal(next.room.guests.g1.presenceRevision, 2);
  assert.equal(next.room.guests.g1.authToken, 'auth-1');
  const third = bumpGuestPresenceRevision(next.room, 'g1');
  assert.equal(third.revision, 3);
});

function probeRoomCode(seed) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const digest = createHash('sha256').update(String(seed)).digest();
  return Array.from(digest.subarray(0, 7), (byte) => alphabet[byte % alphabet.length]).join('');
}

function publicSocketUrl(pagesUrl, params) {
  const url = new URL('/ws', pagesUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

function socketInbox(ws) {
  const frames = [];
  const waiters = [];
  let closed = null;

  const settle = (frame) => {
    const index = waiters.findIndex((waiter) => waiter.predicate(frame));
    if (index < 0) {
      frames.push(frame);
      return;
    }
    const [waiter] = waiters.splice(index, 1);
    clearTimeout(waiter.timer);
    waiter.resolve(frame);
  };

  ws.addEventListener('message', (event) => {
    try {
      settle(JSON.parse(String(event.data)));
    } catch (error) {
      settle({ parseError: String(error), raw: String(event.data) });
    }
  });
  ws.addEventListener('close', (event) => {
    closed = { code: event.code, reason: event.reason };
    while (waiters.length) {
      const waiter = waiters.shift();
      clearTimeout(waiter.timer);
      waiter.reject(new Error(`socket closed before ${waiter.label}: ${event.code} ${event.reason}`));
    }
  });

  return {
    waitFor(predicate, label, timeoutMs = 10000) {
      const foundIndex = frames.findIndex(predicate);
      if (foundIndex >= 0) return Promise.resolve(frames.splice(foundIndex, 1)[0]);
      if (closed) return Promise.reject(new Error(`socket already closed before ${label}: ${closed.code} ${closed.reason}`));
      return new Promise((resolve, reject) => {
        const waiter = {
          predicate,
          label,
          resolve,
          reject,
          timer: setTimeout(() => {
            const index = waiters.indexOf(waiter);
            if (index >= 0) waiters.splice(index, 1);
            reject(new Error(`timeout waiting for ${label}`));
          }, timeoutMs),
        };
        waiters.push(waiter);
      });
    },
  };
}

function waitForOpen(ws, label, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout opening ${label}`)), timeoutMs);
    ws.addEventListener('open', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error(`websocket error opening ${label}`));
    }, { once: true });
  });
}

function waitForClose(ws, label, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout closing ${label}`)), timeoutMs);
    ws.addEventListener('close', (event) => {
      clearTimeout(timer);
      resolve({ code: event.code, reason: event.reason });
    }, { once: true });
  });
}

async function openProbeSocket(pagesUrl, handshake, label) {
  if (typeof WebSocket !== 'function') throw new Error('Node runtime does not expose WebSocket');
  const ws = new WebSocket(publicSocketUrl(pagesUrl, handshake));
  const inbox = socketInbox(ws);
  await waitForOpen(ws, label);
  return { ws, inbox };
}

test('live public Pages friend-room WebSocket routes and reconnects', { skip: !process.env.GAMEROAD_PUBLIC_WS_PROBE_URL }, async () => {
  const pagesUrl = process.env.GAMEROAD_PUBLIC_WS_PROBE_URL;
  const runIdentity = `${process.env.GITHUB_RUN_ID || 'probe'}:${process.env.GITHUB_RUN_ATTEMPT || '1'}:${process.env.GITHUB_SHA || ''}`;
  const code = probeRoomCode(runIdentity);
  const publicChannel = `gameroad.friend.r2.${code}`;
  const suffix = String(process.env.GITHUB_RUN_ID || Date.now());
  const hostId = `host-${suffix}`;
  const guestId = `guest-${suffix}`;
  const authToken = `auth-${suffix}-${code}`;
  const baseHandshake = { channel: publicChannel };

  let hostSocket;
  let guestSocket;
  let reconnectedSocket;
  try {
    const hostPeer = await openProbeSocket(pagesUrl, { ...baseHandshake, role: 'host', clientId: hostId, authToken: '' }, 'host');
    hostSocket = hostPeer.ws;
    const guestPeer = await openProbeSocket(pagesUrl, { ...baseHandshake, role: 'guest', clientId: guestId, authToken: '' }, 'guest');
    guestSocket = guestPeer.ws;

    const firstPresence = await hostPeer.inbox.waitFor(
      (value) => value?.wire === WS_WIRE && value?.payload?.type === TRANSPORT_PRESENCE_TYPE && value.payload.clientId === guestId && value.payload.kind === 'rejoin',
      'initial guest presence',
    );
    assert.equal(firstPresence.payload.code, code);
    assert.equal(firstPresence.payload.revision >= 1, true);

    hostSocket.send(JSON.stringify({
      wire: WS_WIRE,
      op: 'data',
      payload: { code, type: 'accept', to: guestId, authToken, probe: 'host-accept' },
    }));
    const accept = await guestPeer.inbox.waitFor(
      (value) => value?.wire === WS_WIRE && value?.payload?.type === 'accept' && value.payload.to === guestId,
      'host accept',
    );
    assert.equal(accept.payload.authToken, authToken);

    guestSocket.send(JSON.stringify({
      wire: WS_WIRE,
      op: 'data',
      payload: { code, type: 'join', clientId: guestId, authToken, seq: 1, probe: 'guest-to-host' },
    }));
    const guestToHost = await hostPeer.inbox.waitFor(
      (value) => value?.wire === WS_WIRE && value?.payload?.type === 'join' && value.payload.probe === 'guest-to-host',
      'guest to host frame',
    );
    assert.equal(guestToHost.payload.clientId, guestId);

    hostSocket.send(JSON.stringify({
      wire: WS_WIRE,
      op: 'data',
      payload: { code, type: 'lobby', to: guestId, probe: 'host-to-guest' },
    }));
    const hostToGuest = await guestPeer.inbox.waitFor(
      (value) => value?.wire === WS_WIRE && value?.payload?.type === 'lobby' && value.payload.probe === 'host-to-guest',
      'host to guest frame',
    );
    assert.equal(hostToGuest.payload.to, guestId);

    const oldGuestClosed = waitForClose(guestSocket, 'replaced guest');
    const reconnectedPeer = await openProbeSocket(
      pagesUrl,
      { ...baseHandshake, role: 'guest', clientId: guestId, authToken },
      'authenticated reconnect',
    );
    reconnectedSocket = reconnectedPeer.ws;

    const secondPresence = await hostPeer.inbox.waitFor(
      (value) => value?.wire === WS_WIRE && value?.payload?.type === TRANSPORT_PRESENCE_TYPE && value.payload.clientId === guestId && value.payload.kind === 'rejoin' && value.payload.revision > firstPresence.payload.revision,
      'reconnect presence',
    );
    assert.equal(secondPresence.payload.revision > firstPresence.payload.revision, true);
    const replaced = await oldGuestClosed;
    assert.equal(replaced.code, 1012);

    reconnectedSocket.send(JSON.stringify({
      wire: WS_WIRE,
      op: 'data',
      payload: { code, type: 'join', clientId: guestId, authToken, seq: 2, probe: 'reconnected-guest-to-host' },
    }));
    const afterReconnect = await hostPeer.inbox.waitFor(
      (value) => value?.wire === WS_WIRE && value?.payload?.type === 'join' && value.payload.probe === 'reconnected-guest-to-host',
      'authenticated reconnect frame',
    );
    assert.equal(afterReconnect.payload.authToken, authToken);
  } finally {
    for (const socket of [reconnectedSocket, guestSocket, hostSocket]) {
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        try { socket.close(1000, 'probe complete'); } catch {}
      }
    }
  }
});
