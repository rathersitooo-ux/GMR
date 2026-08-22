import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  WS_WIRE,
  TRANSPORT_PRESENCE_TYPE,
  admitConnection,
  bumpGuestPresenceRevision,
  emptyRoom,
  makeTransportPresenceFrame,
  routeFrame,
  shouldPreserveRoomAfterHostClose,
} from '../relay/src/relay-core.mjs';
import {
  applyHatePeerPresenceEvent,
  createHatePeerPresenceState,
  projectHateHumanWaitSourceEligibility,
} from '../../../browser/hate-peer-presence-core.mjs';

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

test('same host identity reconnect requests replacement without permitting host takeover', () => {
  const room = roomWithHost();
  const replacement = admitConnection(room, host, active(host));
  assert.equal(replacement.ok, true);
  assert.equal(replacement.replaceHostClientId, 'host-1');
  assert.equal(replacement.room.hostClientId, 'host-1');
  assert.equal(
    admitConnection(room, { ...host, clientId: 'host-2' }, active(host)).reason,
    'host_exists',
  );
});

test('host close policy preserves reconnectable drops but tears down an intentional normal close', () => {
  assert.equal(shouldPreserveRoomAfterHostClose(1000), false);
  assert.equal(shouldPreserveRoomAfterHostClose(1001), true);
  assert.equal(shouldPreserveRoomAfterHostClose(1006), true);
  assert.equal(shouldPreserveRoomAfterHostClose(undefined), true);
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

test('routing ignores presence-closed peers while a same-identity replacement settles', () => {
  const room = admitGuest(roomWithHost(), 'g1');
  const staleHost = { ...host, presenceClosed: true };
  const liveHost = { ...host, presenceClosed: false };
  const guestFrame = frame({ type: 'join', clientId: 'g1', authToken: '', seq: 1 });
  assert.equal(routeFrame(room, guest('g1'), guestFrame, active(staleHost)).reason, 'host_unavailable');
  assert.equal(routeFrame(room, guest('g1'), guestFrame, active(staleHost, liveHost)).ok, true);
  const staleGuest = { ...guest('g1'), presenceClosed: true };
  assert.equal(
    routeFrame(room, host, frame({ type: 'lobby', to: 'g1' }), active(liveHost, staleGuest)).reason,
    'transport_target_unavailable',
  );
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
  let reconnectedHostSocket;
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

    const oldHostClosed = waitForClose(hostSocket, 'replaced host');
    const reconnectedHostPeer = await openProbeSocket(
      pagesUrl,
      { ...baseHandshake, role: 'host', clientId: hostId, authToken: '' },
      'same-id host reconnect',
    );
    reconnectedHostSocket = reconnectedHostPeer.ws;
    const hostReplaced = await oldHostClosed;
    assert.equal(hostReplaced.code, 1012);

    reconnectedSocket.send(JSON.stringify({
      wire: WS_WIRE,
      op: 'data',
      payload: { code, type: 'join', clientId: guestId, authToken, seq: 3, probe: 'guest-after-host-reconnect' },
    }));
    const guestAfterHostReconnect = await reconnectedHostPeer.inbox.waitFor(
      (value) => value?.wire === WS_WIRE && value?.payload?.type === 'join' && value.payload.probe === 'guest-after-host-reconnect',
      'guest frame after host reconnect',
    );
    assert.equal(guestAfterHostReconnect.payload.clientId, guestId);

    reconnectedHostSocket.send(JSON.stringify({
      wire: WS_WIRE,
      op: 'data',
      payload: { code, type: 'lobby', to: guestId, probe: 'reconnected-host-to-guest' },
    }));
    const hostAfterReconnect = await reconnectedPeer.inbox.waitFor(
      (value) => value?.wire === WS_WIRE && value?.payload?.type === 'lobby' && value.payload.probe === 'reconnected-host-to-guest',
      'reconnected host to surviving guest frame',
    );
    assert.equal(hostAfterReconnect.payload.to, guestId);
  } finally {
    for (const socket of [reconnectedHostSocket, reconnectedSocket, guestSocket, hostSocket]) {
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        try { socket.close(1000, 'probe complete'); } catch {}
      }
    }
  }
});

test('live public Pages survives abrupt host process loss before reconnect without ejecting the guest', { skip: !process.env.GAMEROAD_PUBLIC_WS_PROBE_URL }, async () => {
  const pagesUrl = process.env.GAMEROAD_PUBLIC_WS_PROBE_URL;
  const runIdentity = `${process.env.GITHUB_RUN_ID || 'probe'}:${process.env.GITHUB_RUN_ATTEMPT || '1'}:${process.env.GITHUB_SHA || ''}:host-drop-first`;
  const code = probeRoomCode(runIdentity);
  const publicChannel = `gameroad.friend.r2.${code}`;
  const suffix = String(process.env.GITHUB_RUN_ID || Date.now());
  const hostId = `drop-host-${suffix}`;
  const guestId = `drop-guest-${suffix}`;
  const authToken = `drop-auth-${suffix}-${code}`;
  const baseHandshake = { channel: publicChannel };
  let hostProcess;
  let guestSocket;
  let reconnectedHostSocket;

  const waitLine = (stream, expected, label, timeoutMs = 10000) => new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${label}`)), timeoutMs);
    const onData = (chunk) => {
      buffer += String(chunk);
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      if (!lines.some((line) => line.trim() === expected)) return;
      clearTimeout(timer);
      stream.off('data', onData);
      resolve(expected);
    };
    stream.on('data', onData);
  });
  const waitExit = (child, label, timeoutMs = 10000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${label}`)), timeoutMs);
    child.once('exit', (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ exitCode, signal });
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  try {
    const hostUrl = String(publicSocketUrl(pagesUrl, { ...baseHandshake, role: 'host', clientId: hostId, authToken: '' }));
    const childScript = `
      const ws = new WebSocket(process.env.GR_HOST_URL);
      ws.addEventListener('open', () => process.stdout.write('HOST_OPEN\\n'));
      ws.addEventListener('message', (event) => {
        let value;
        try { value = JSON.parse(String(event.data)); } catch { return; }
        if (value?.wire !== process.env.GR_WIRE
  || value?.payload?.type !== process.env.GR_PRESENCE
  || value.payload.clientId !== process.env.GR_GUEST_ID
  || value.payload.kind !== 'rejoin') return;
        ws.send(JSON.stringify({
wire: process.env.GR_WIRE,
op: 'data',
payload: {
  code: process.env.GR_CODE,
  type: 'accept',
  to: process.env.GR_GUEST_ID,
  authToken: process.env.GR_AUTH,
  probe: 'drop-first-accept',
},
        }));
        process.stdout.write('ACCEPT_SENT\\n');
      });
      ws.addEventListener('error', () => process.stderr.write('HOST_SOCKET_ERROR\\n'));
      setInterval(() => {}, 1000);
    `;
    hostProcess = spawn(process.execPath, ['--input-type=module', '-e', childScript], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GR_HOST_URL: hostUrl,
        GR_WIRE: WS_WIRE,
        GR_PRESENCE: TRANSPORT_PRESENCE_TYPE,
        GR_GUEST_ID: guestId,
        GR_CODE: code,
        GR_AUTH: authToken,
      },
    });
    const hostOpened = waitLine(hostProcess.stdout, 'HOST_OPEN', 'abrupt host open');
    const acceptSent = waitLine(hostProcess.stdout, 'ACCEPT_SENT', 'abrupt host accept');
    await hostOpened;

    const guestPeer = await openProbeSocket(
      pagesUrl,
      { ...baseHandshake, role: 'guest', clientId: guestId, authToken: '' },
      'drop-first guest',
    );
    guestSocket = guestPeer.ws;
    const accept = await guestPeer.inbox.waitFor(
      (value) => value?.wire === WS_WIRE && value?.payload?.type === 'accept' && value.payload.to === guestId,
      'drop-first accept',
    );
    await acceptSent;
    assert.equal(accept.payload.authToken, authToken);

    const exited = waitExit(hostProcess, 'abrupt host exit');
    assert.equal(hostProcess.kill('SIGKILL'), true);
    const killed = await exited;
    assert.equal(killed.signal, 'SIGKILL');
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(guestSocket.readyState, WebSocket.OPEN);

    const replacementHost = await openProbeSocket(
      pagesUrl,
      { ...baseHandshake, role: 'host', clientId: hostId, authToken: '' },
      'drop-first same-id host reconnect',
    );
    reconnectedHostSocket = replacementHost.ws;
    guestSocket.send(JSON.stringify({
      wire: WS_WIRE,
      op: 'data',
      payload: { code, type: 'join', clientId: guestId, authToken, seq: 1, probe: 'guest-after-drop-first-host' },
    }));
    const guestAfterReconnect = await replacementHost.inbox.waitFor(
      (value) => value?.wire === WS_WIRE && value?.payload?.type === 'join' && value.payload.probe === 'guest-after-drop-first-host',
      'guest route after drop-first host reconnect',
    );
    assert.equal(guestAfterReconnect.payload.clientId, guestId);
    assert.equal(guestAfterReconnect.payload.authToken, authToken);

    reconnectedHostSocket.send(JSON.stringify({
      wire: WS_WIRE,
      op: 'data',
      payload: { code, type: 'lobby', to: guestId, probe: 'host-after-drop-first-reconnect' },
    }));
    const hostAfterReconnect = await guestPeer.inbox.waitFor(
      (value) => value?.wire === WS_WIRE && value?.payload?.type === 'lobby' && value.payload.probe === 'host-after-drop-first-reconnect',
      'host route to surviving guest after drop-first reconnect',
    );
    assert.equal(hostAfterReconnect.payload.to, guestId);
  } finally {
    if (hostProcess && hostProcess.exitCode === null && hostProcess.signalCode === null) {
      try { hostProcess.kill('SIGKILL'); } catch {}
    }
    for (const socket of [reconnectedHostSocket, guestSocket]) {
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        try { socket.close(1000, 'probe complete'); } catch {}
      }
    }
  }
});
test('live public Pages four-player presence is compatible with HATE disconnect and rejoin contract', { skip: !process.env.GAMEROAD_PUBLIC_WS_PROBE_URL }, async () => {
  const pagesUrl = process.env.GAMEROAD_PUBLIC_WS_PROBE_URL;
  const runIdentity = `${process.env.GITHUB_RUN_ID || 'probe'}:${process.env.GITHUB_RUN_ATTEMPT || '1'}:${process.env.GITHUB_SHA || ''}:hate-4p`;
  const code = probeRoomCode(runIdentity);
  const publicChannel = `gameroad.friend.r2.${code}`;
  const suffix = String(process.env.GITHUB_RUN_ID || Date.now());
  const hostId = `hate-host-${suffix}`;
  const guestIds = [1, 2, 3].map((index) => `hate-g${index}-${suffix}`);
  const authTokens = guestIds.map((guestId, index) => `hate-auth-${index + 1}-${guestId}-${code}`);
  const baseHandshake = { channel: publicChannel };
  const guestPeers = [];
  const presenceStates = new Map();
  let hostSocket;
  let reconnectedSocket;

  const applyPresence = (state, payload) => applyHatePeerPresenceEvent(state, {
    kind: payload.kind,
    peerId: payload.clientId,
    sessionId: payload.sessionId,
    revision: payload.revision,
  });

  try {
    const hostPeer = await openProbeSocket(
      pagesUrl,
      { ...baseHandshake, role: 'host', clientId: hostId, authToken: '' },
      'four-player HATE host',
    );
    hostSocket = hostPeer.ws;

    for (let index = 0; index < guestIds.length; index += 1) {
      const guestId = guestIds[index];
      const authToken = authTokens[index];
      const peer = await openProbeSocket(
        pagesUrl,
        { ...baseHandshake, role: 'guest', clientId: guestId, authToken: '' },
        `four-player guest ${index + 1}`,
      );
      guestPeers.push(peer);

      const presence = await hostPeer.inbox.waitFor(
        (value) => value?.wire === WS_WIRE
          && value?.payload?.type === TRANSPORT_PRESENCE_TYPE
          && value.payload.clientId === guestId
          && value.payload.kind === 'rejoin',
        `initial presence for ${guestId}`,
      );
      assert.equal(presence.payload.code, code);
      assert.equal(presence.payload.revision >= 1, true);
      const initialState = createHatePeerPresenceState({
        peerId: guestId,
        sessionId: presence.payload.sessionId,
        revision: 0,
        connected: false,
      });
      const joined = applyPresence(initialState, presence.payload);
      assert.equal(joined.ok, true);
      assert.equal(projectHateHumanWaitSourceEligibility(joined.state).eligible, true);
      presenceStates.set(guestId, joined.state);

      hostSocket.send(JSON.stringify({
        wire: WS_WIRE,
        op: 'data',
        payload: { code, type: 'accept', to: guestId, authToken, probe: `hate-accept-${index + 1}` },
      }));
      const accept = await peer.inbox.waitFor(
        (value) => value?.wire === WS_WIRE && value?.payload?.type === 'accept' && value.payload.to === guestId,
        `accept for ${guestId}`,
      );
      assert.equal(accept.payload.authToken, authToken);
    }

    assert.equal(guestPeers.length, 3);
    for (const guestId of guestIds) {
      assert.equal(projectHateHumanWaitSourceEligibility(presenceStates.get(guestId)).eligible, true);
    }

    const droppedGuestId = guestIds[0];
    const droppedSocket = guestPeers[0].ws;
    const droppedState = presenceStates.get(droppedGuestId);
    const disconnectPresencePromise = hostPeer.inbox.waitFor(
      (value) => value?.wire === WS_WIRE
        && value?.payload?.type === TRANSPORT_PRESENCE_TYPE
        && value.payload.clientId === droppedGuestId
        && value.payload.kind === 'disconnect'
        && value.payload.revision > droppedState.revision,
      'authoritative disconnect presence',
    );
    droppedSocket.close(4001, 'hate presence acceptance drop');
    const disconnectPresence = await disconnectPresencePromise;
    assert.equal(disconnectPresence.payload.sessionId, droppedState.sessionId);
    const disconnected = applyPresence(droppedState, disconnectPresence.payload);
    assert.equal(disconnected.ok, true);
    assert.equal(projectHateHumanWaitSourceEligibility(disconnected.state).eligible, false);

    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(projectHateHumanWaitSourceEligibility(disconnected.state).eligible, false);

    const duplicateDisconnect = applyPresence(disconnected.state, disconnectPresence.payload);
    assert.equal(duplicateDisconnect.ok, false);
    assert.equal(duplicateDisconnect.reason, 'EVENT_STALE_OR_DUPLICATE');
    assert.equal(projectHateHumanWaitSourceEligibility(duplicateDisconnect.state).eligible, false);

    const reconnectedPeer = await openProbeSocket(
      pagesUrl,
      { ...baseHandshake, role: 'guest', clientId: droppedGuestId, authToken: authTokens[0] },
      'four-player authenticated HATE rejoin',
    );
    reconnectedSocket = reconnectedPeer.ws;
    const rejoinPresence = await hostPeer.inbox.waitFor(
      (value) => value?.wire === WS_WIRE
        && value?.payload?.type === TRANSPORT_PRESENCE_TYPE
        && value.payload.clientId === droppedGuestId
        && value.payload.kind === 'rejoin'
        && value.payload.revision > disconnectPresence.payload.revision,
      'authoritative rejoin presence',
    );
    assert.equal(rejoinPresence.payload.sessionId, disconnected.state.sessionId);
    const rejoined = applyPresence(disconnected.state, rejoinPresence.payload);
    assert.equal(rejoined.ok, true);
    assert.equal(projectHateHumanWaitSourceEligibility(rejoined.state).eligible, true);

    for (const guestId of guestIds.slice(1)) {
      assert.equal(projectHateHumanWaitSourceEligibility(presenceStates.get(guestId)).eligible, true);
    }
  } finally {
    for (const socket of [reconnectedSocket, ...guestPeers.map((peer) => peer.ws), hostSocket]) {
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        try { socket.close(1000, 'probe complete'); } catch {}
      }
    }
  }
});
