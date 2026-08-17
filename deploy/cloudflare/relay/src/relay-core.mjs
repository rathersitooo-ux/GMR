export const WS_WIRE = 'gameroad.wsrelay.v1';
export const CHANNEL_PREFIX = 'gameroad.friend.r2.';
export const MAX_GUESTS = 3;
export const TRANSPORT_PRESENCE_TYPE = 'transport_presence';
const CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{7}$/;
const TRANSPORT_PRESENCE_KINDS = new Set(['disconnect', 'rejoin', 'sync']);

export function emptyRoom() {
  return { hostClientId: '', guests: {} };
}

function safePresenceRevision(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function normalizeRoom(raw) {
  const room = raw && typeof raw === 'object' ? raw : {};
  const guests = {};
  for (const [clientId, value] of Object.entries(room.guests || {})) {
    if (!validClientId(clientId)) continue;
    guests[clientId] = {
      authToken: safeToken(value?.authToken),
      presenceRevision: safePresenceRevision(value?.presenceRevision),
    };
  }
  return { hostClientId: validClientId(room.hostClientId) ? room.hostClientId : '', guests };
}

export function parseChannel(channel) {
  const text = String(channel || '');
  if (!text.startsWith(CHANNEL_PREFIX)) return null;
  const code = text.slice(CHANNEL_PREFIX.length);
  return CODE_RE.test(code) ? { channel: text, code } : null;
}

export function validClientId(value) {
  const text = String(value || '');
  return text.length >= 1 && text.length <= 160 && /^[A-Za-z0-9._:-]+$/.test(text);
}

export function safeToken(value) {
  const text = String(value || '');
  return text.length <= 256 ? text : '';
}

export function makeTransportPresenceFrame(code, clientId, sessionId, revision, kind) {
  const safeCode = String(code || '');
  const safeClientId = String(clientId || '');
  const safeSessionId = String(sessionId || '');
  const safeKind = String(kind || '');
  if (!CODE_RE.test(safeCode)) throw new TypeError('TRANSPORT_PRESENCE_CODE_INVALID');
  if (!validClientId(safeClientId)) throw new TypeError('TRANSPORT_PRESENCE_CLIENT_INVALID');
  if (!safeSessionId || safeSessionId.length > 512) throw new TypeError('TRANSPORT_PRESENCE_SESSION_INVALID');
  if (!Number.isSafeInteger(revision) || revision <= 0) throw new TypeError('TRANSPORT_PRESENCE_REVISION_INVALID');
  if (!TRANSPORT_PRESENCE_KINDS.has(safeKind)) throw new TypeError('TRANSPORT_PRESENCE_KIND_INVALID');
  return {
    wire: WS_WIRE,
    op: 'data',
    payload: {
      v: 2,
      code: safeCode,
      type: TRANSPORT_PRESENCE_TYPE,
      clientId: safeClientId,
      sessionId: safeSessionId,
      revision,
      kind: safeKind,
    },
  };
}

export function admitConnection(roomInput, handshake, active = []) {
  const room = normalizeRoom(roomInput);
  const parsed = parseChannel(handshake?.channel);
  const role = String(handshake?.role || '');
  const clientId = String(handshake?.clientId || '');
  const authToken = safeToken(handshake?.authToken);
  if (!parsed) return reject('transport_room_invalid', room);
  if (role !== 'host' && role !== 'guest') return reject('transport_role_invalid', room);
  if (!validClientId(clientId)) return reject('transport_client_invalid', room);

  if (role === 'host') {
    if (room.hostClientId && room.hostClientId !== clientId) return reject('host_exists', room);
    room.hostClientId = clientId;
    return { ok: true, room, attachment: { channel: parsed.channel, code: parsed.code, role, clientId, authToken: '' } };
  }

  const known = room.guests[clientId];
  if (known?.authToken && authToken !== known.authToken) return reject('transport_auth_mismatch', room);
  if (!known && Object.keys(room.guests).length >= MAX_GUESTS) return reject('room_full', room);
  const presenceRevision = safePresenceRevision(known?.presenceRevision) + 1;
  room.guests[clientId] = {
    authToken: known?.authToken || authToken,
    presenceRevision,
  };
  const sameActive = active.find((x) => x?.role === 'guest' && x?.clientId === clientId) || null;
  return {
    ok: true,
    room,
    attachment: { channel: parsed.channel, code: parsed.code, role, clientId, authToken: known?.authToken || authToken },
    presenceRevision,
    replaceClientId: sameActive ? clientId : '',
  };
}

export function bumpGuestPresenceRevision(roomInput, clientId) {
  const room = normalizeRoom(roomInput);
  const safeClientId = String(clientId || '');
  const guest = room.guests[safeClientId];
  if (!guest) return { ok: false, reason: 'transport_unknown_guest', room, revision: 0 };
  guest.presenceRevision = safePresenceRevision(guest.presenceRevision) + 1;
  return { ok: true, room, revision: guest.presenceRevision };
}

export function routeFrame(roomInput, sender, frame, active = []) {
  const room = normalizeRoom(roomInput);
  const parsed = parseChannel(sender?.channel);
  if (!parsed) return reject('transport_room_invalid', room);
  if (!frame || frame.wire !== WS_WIRE || frame.op !== 'data' || !frame.payload || typeof frame.payload !== 'object' || Array.isArray(frame.payload)) {
    return reject('transport_frame_invalid', room);
  }
  const payload = frame.payload;
  if (String(payload.code || '') !== parsed.code) return reject('transport_room_mismatch', room);
  if (payload.type === TRANSPORT_PRESENCE_TYPE) return reject('transport_presence_reserved', room);

  if (sender.role === 'guest') {
    if (String(payload.clientId || '') !== sender.clientId) return reject('transport_client_mismatch', room);
    if (!Number.isSafeInteger(Number(payload.seq)) || Number(payload.seq) <= 0) return reject('transport_seq_invalid', room);
    const known = room.guests[sender.clientId];
    if (!known) return reject('transport_unknown_guest', room);
    const payloadAuth = safeToken(payload.authToken);
    if (known.authToken && payloadAuth !== known.authToken) return reject('transport_auth_mismatch', room);
    if (known.authToken && sender.authToken && sender.authToken !== known.authToken) return reject('transport_auth_mismatch', room);
    const host = active.find((x) => x?.role === 'host' && x?.clientId === room.hostClientId);
    if (!host) return reject('host_unavailable', room);
    return {
      ok: true,
      room,
      targets: [room.hostClientId],
      frame: { wire: WS_WIRE, op: 'data', payload },
      promoteAuthToken: known.authToken && !sender.authToken ? known.authToken : '',
      removeGuestAfterSend: payload.type === 'leave' ? sender.clientId : '',
    };
  }

  if (sender.role === 'host') {
    if (!room.hostClientId || sender.clientId !== room.hostClientId) return reject('transport_host_mismatch', room);
    const to = String(payload.to || '');
    if (!to) return reject('host_target_required', room);
    const guest = room.guests[to];
    if (!guest) return reject('transport_target_unknown', room);
    const target = active.find((x) => x?.role === 'guest' && x?.clientId === to);
    if (!target) return reject('transport_target_unavailable', room);
    let bindAuthToken = '';
    if (payload.type === 'accept') {
      const token = safeToken(payload.authToken);
      if (!token) return reject('transport_accept_auth_required', room);
      guest.authToken = token;
      bindAuthToken = token;
    }
    return {
      ok: true,
      room,
      targets: [to],
      frame: { wire: WS_WIRE, op: 'data', payload },
      bindAuthToken,
    };
  }

  return reject('transport_role_invalid', room);
}

export function transportReject(reason) {
  return { wire: WS_WIRE, op: 'transport_reject', reason: String(reason || 'transport_reject') };
}

function reject(reason, room) {
  return { ok: false, reason, room };
}
