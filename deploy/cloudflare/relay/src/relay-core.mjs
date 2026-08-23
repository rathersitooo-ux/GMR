export const WS_WIRE = 'gameroad.wsrelay.v1';
export const CHANNEL_PREFIX = 'gameroad.friend.r2.';
export const MAX_GUESTS = 3;
export const TRANSPORT_PRESENCE_TYPE = 'transport_presence';
const CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{7}$/;
const TRANSPORT_PRESENCE_KINDS = new Set(['disconnect', 'rejoin', 'sync']);

export function emptyRoom() {
  return { hostClientId: '', guests: {} };
}

export function shouldPreserveRoomAfterHostClose(code) {
  const closeCode = Number(code);
  return !Number.isInteger(closeCode) || closeCode !== 1000;
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
    const sameActiveHost = active.find(
      (x) => x?.role === 'host' && x?.clientId === clientId && x?.presenceClosed !== true
    ) || null;
    room.hostClientId = clientId;
    return {
      ok: true,
      room,
      attachment: { channel: parsed.channel, code: parsed.code, role, clientId, authToken: '' },
      replaceHostClientId: sameActiveHost ? clientId : '',
    };
  }

  const known = room.guests[clientId];
  if (known?.authToken && authToken !== known.authToken) return reject('transport_auth_mismatch', room);
  if (!known && Object.keys(room.guests).length >= MAX_GUESTS) return reject('room_full', room);
  const presenceRevision = safePresenceRevision(known?.presenceRevision) + 1;
  room.guests[clientId] = {
    authToken: known?.authToken || authToken,
    presenceRevision,
  };
  const sameActive = active.find(
    (x) => x?.role === 'guest' && x?.clientId === clientId && x?.presenceClosed !== true
  ) || null;
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
    const host = active.find(
      (x) => x?.role === 'host' && x?.clientId === room.hostClientId && x?.presenceClosed !== true
    );
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
    const target = active.find(
      (x) => x?.role === 'guest' && x?.clientId === to && x?.presenceClosed !== true
    );
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

export const MATCH_QUEUE_SCHEMA = 'gameroad.normalmatch.queue.v1';
export const MATCH_TICKET_WAITING = 'WAITING';
export const MATCH_TICKET_MATCHED = 'MATCHED';
export const MATCH_TICKET_CANCELLED = 'CANCELLED';
export const MATCH_SIZE = 4;
export const MAX_WAITING_TICKETS = 128;

const MATCH_ID_RE = /^[A-Za-z0-9._:-]{1,160}$/;
const MATCH_KEY_RE = /^[A-Za-z0-9._:-]{8,192}$/;
const MATCH_TOKEN_RE = /^[A-Za-z0-9_-]{24,256}$/;

export function emptyMatchQueue() {
  return {
    schema: MATCH_QUEUE_SCHEMA,
    nextSequence: 1,
    tickets: {},
    idempotency: {},
    matches: {},
  };
}

export function validMatchClientId(value) { return MATCH_ID_RE.test(String(value || '')); }
export function validMatchIdempotencyKey(value) { return MATCH_KEY_RE.test(String(value || '')); }
export function validMatchTicketId(value) { return MATCH_ID_RE.test(String(value || '')); }
export function validMatchId(value) { return MATCH_ID_RE.test(String(value || '')); }
export function validMatchSecret(value) { return MATCH_TOKEN_RE.test(String(value || '')); }

export function normalizeMatchQueue(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = emptyMatchQueue();
  out.nextSequence = Number.isSafeInteger(src.nextSequence) && src.nextSequence > 0 ? src.nextSequence : 1;

  for (const [ticketId, ticket] of Object.entries(src.tickets || {})) {
    if (!validMatchTicketId(ticketId) || !ticket || typeof ticket !== 'object') continue;
    const status = [MATCH_TICKET_WAITING, MATCH_TICKET_MATCHED, MATCH_TICKET_CANCELLED].includes(ticket.status)
      ? ticket.status
      : '';
    if (!status || !validMatchClientId(ticket.clientId) || !validMatchSecret(ticket.secret)) continue;
    const sequence = Number.isSafeInteger(ticket.sequence) && ticket.sequence > 0 ? ticket.sequence : 0;
    const matchId = status === MATCH_TICKET_MATCHED && validMatchId(ticket.matchId) ? ticket.matchId : '';
    out.tickets[ticketId] = {
      clientId: ticket.clientId,
      secret: ticket.secret,
      status,
      sequence,
      matchId,
    };
  }

  for (const [key, ticketId] of Object.entries(src.idempotency || {})) {
    if (validMatchIdempotencyKey(key) && validMatchTicketId(ticketId) && out.tickets[ticketId]) {
      out.idempotency[key] = ticketId;
    }
  }

  for (const [matchId, match] of Object.entries(src.matches || {})) {
    if (!validMatchId(matchId) || !match || typeof match !== 'object' || !Array.isArray(match.ticketIds)) continue;
    const ticketIds = match.ticketIds.filter(
      (ticketId) => validMatchTicketId(ticketId) && out.tickets[ticketId]?.matchId === matchId,
    );
    if (ticketIds.length === MATCH_SIZE) out.matches[matchId] = { ticketIds };
  }
  return out;
}

function rejectMatch(reason, queue) {
  return { ok: false, reason, queue };
}

function publicMatchTicket(ticketId, ticket) {
  return {
    ticketId,
    clientId: ticket.clientId,
    status: ticket.status,
    matchId: ticket.matchId || '',
  };
}

function waitingMatchTicketIds(queue) {
  return Object.entries(queue.tickets)
    .filter(([, ticket]) => ticket.status === MATCH_TICKET_WAITING)
    .sort((a, b) => a[1].sequence - b[1].sequence || a[0].localeCompare(b[0]))
    .map(([ticketId]) => ticketId);
}

function clientAlreadyWaiting(queue, clientId) {
  return Object.values(queue.tickets).some(
    (ticket) => ticket.clientId === clientId && ticket.status === MATCH_TICKET_WAITING,
  );
}

function maybeFormMatch(queue, generatedMatchId) {
  const waiting = waitingMatchTicketIds(queue);
  if (waiting.length < MATCH_SIZE) return { queue, matchId: '' };
  if (!validMatchId(generatedMatchId)) throw new TypeError('generated_match_id_invalid');
  if (queue.matches[generatedMatchId]) throw new TypeError('generated_match_id_collision');
  const selected = waiting.slice(0, MATCH_SIZE);
  for (const ticketId of selected) {
    queue.tickets[ticketId] = {
      ...queue.tickets[ticketId],
      status: MATCH_TICKET_MATCHED,
      matchId: generatedMatchId,
    };
  }
  queue.matches[generatedMatchId] = { ticketIds: selected };
  return { queue, matchId: generatedMatchId };
}

export function createMatchTicket(queueInput, input, generated) {
  const queue = normalizeMatchQueue(queueInput);
  const clientId = String(input?.clientId || '');
  const idempotencyKey = String(input?.idempotencyKey || '');
  if (!validMatchClientId(clientId)) return rejectMatch('match_client_invalid', queue);
  if (!validMatchIdempotencyKey(idempotencyKey)) return rejectMatch('match_idempotency_invalid', queue);

  const priorTicketId = queue.idempotency[idempotencyKey];
  if (priorTicketId) {
    const prior = queue.tickets[priorTicketId];
    if (!prior || prior.clientId !== clientId) return rejectMatch('match_idempotency_conflict', queue);
    return {
      ok: true,
      queue,
      idempotent: true,
      ticket: publicMatchTicket(priorTicketId, prior),
      secret: prior.secret,
      formedMatchId: '',
    };
  }

  if (clientAlreadyWaiting(queue, clientId)) return rejectMatch('match_client_already_waiting', queue);
  if (waitingMatchTicketIds(queue).length >= MAX_WAITING_TICKETS) return rejectMatch('match_queue_full', queue);

  const ticketId = String(generated?.ticketId || '');
  const secret = String(generated?.secret || '');
  if (!validMatchTicketId(ticketId)) throw new TypeError('generated_ticket_id_invalid');
  if (!validMatchSecret(secret)) throw new TypeError('generated_ticket_secret_invalid');
  if (queue.tickets[ticketId]) throw new TypeError('generated_ticket_id_collision');

  queue.tickets[ticketId] = {
    clientId,
    secret,
    status: MATCH_TICKET_WAITING,
    sequence: queue.nextSequence++,
    matchId: '',
  };
  queue.idempotency[idempotencyKey] = ticketId;
  const matched = maybeFormMatch(queue, String(generated?.matchId || ''));
  const ticket = matched.queue.tickets[ticketId];
  return {
    ok: true,
    queue: matched.queue,
    idempotent: false,
    ticket: publicMatchTicket(ticketId, ticket),
    secret,
    formedMatchId: matched.matchId,
  };
}

function authorizeMatchTicket(queue, input) {
  const ticketId = String(input?.ticketId || '');
  const secret = String(input?.secret || '');
  if (!validMatchTicketId(ticketId) || !validMatchSecret(secret)) {
    return { ok: false, reason: 'match_ticket_auth_invalid' };
  }
  const ticket = queue.tickets[ticketId];
  if (!ticket || ticket.secret !== secret) return { ok: false, reason: 'match_ticket_auth_invalid' };
  return { ok: true, ticketId, ticket };
}

export function matchTicketStatus(queueInput, input) {
  const queue = normalizeMatchQueue(queueInput);
  const auth = authorizeMatchTicket(queue, input);
  if (!auth.ok) return rejectMatch(auth.reason, queue);
  const match = auth.ticket.matchId ? queue.matches[auth.ticket.matchId] || null : null;
  return {
    ok: true,
    queue,
    ticket: publicMatchTicket(auth.ticketId, auth.ticket),
    match: match ? { matchId: auth.ticket.matchId, ticketIds: [...match.ticketIds] } : null,
  };
}

export function cancelMatchTicket(queueInput, input) {
  const queue = normalizeMatchQueue(queueInput);
  const auth = authorizeMatchTicket(queue, input);
  if (!auth.ok) return rejectMatch(auth.reason, queue);
  if (auth.ticket.status === MATCH_TICKET_MATCHED) {
    return {
      ok: true,
      queue,
      cancelled: false,
      terminal: MATCH_TICKET_MATCHED,
      ticket: publicMatchTicket(auth.ticketId, auth.ticket),
    };
  }
  if (auth.ticket.status === MATCH_TICKET_CANCELLED) {
    return {
      ok: true,
      queue,
      cancelled: true,
      terminal: MATCH_TICKET_CANCELLED,
      ticket: publicMatchTicket(auth.ticketId, auth.ticket),
    };
  }
  queue.tickets[auth.ticketId] = {
    ...auth.ticket,
    status: MATCH_TICKET_CANCELLED,
    matchId: '',
  };
  return {
    ok: true,
    queue,
    cancelled: true,
    terminal: MATCH_TICKET_CANCELLED,
    ticket: publicMatchTicket(auth.ticketId, queue.tickets[auth.ticketId]),
  };
}
