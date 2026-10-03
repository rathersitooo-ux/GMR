import { DurableObject } from 'cloudflare:workers';
import {
  WS_WIRE,
  admitConnection,
  bumpGuestPresenceRevision,
  emptyRoom,
  makeTransportPresenceFrame,
  normalizeRoom,
  parseChannel,
  routeFrame,
  shouldPreserveRoomAfterHostClose,
  transportReject,
} from './relay-core.mjs';
import {
  cancelStoredMatchTicket,
  createStoredMatchTicket,
  serviceStoredMatchTimeout,
  storedMatchTicketStatus,
} from './match-store.mjs';
import { handleBattleReceiptRequest, handlePartnerReportRequest } from './partner-report-store.mjs';
import {
  claimInitialManiiGrant,
  createPlayerAccount,
  derivePlayerAccountId,
  issuePlayerSession,
  readPlayerAccount,
  revokePlayerSession,
} from './account-store.mjs';

const ROOM_KEY = 'room.v1';

function attachmentOf(ws) {
  try { return ws.deserializeAttachment() || null; } catch { return null; }
}

function activeEntries(ctx) {
  return ctx.getWebSockets().map((ws) => ({ ws, ...(attachmentOf(ws) || {}) }));
}

function presenceSessionId(sender) {
  return `${String(sender?.channel || '')}:${String(sender?.clientId || '')}`;
}

function sendGuestPresence(ctx, room, sender, kind, revision) {
  const host = activeEntries(ctx).find(
    (entry) => entry.role === 'host'
      && entry.clientId === room.hostClientId
      && entry.presenceClosed !== true
  );
  if (!host) return false;
  try {
    host.ws.send(JSON.stringify(makeTransportPresenceFrame(
      sender.code,
      sender.clientId,
      presenceSessionId(sender),
      revision,
      kind,
    )));
    return true;
  } catch {
    return false;
  }
}

function rejectSocket(ctx, reason) {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  ctx.acceptWebSocket(server);
  server.serializeAttachment({ role: 'rejected', clientId: '', channel: '', code: '', authToken: '' });
  server.send(JSON.stringify(transportReject(reason)));
  server.close(1008, String(reason).slice(0, 120));
  return new Response(null, { status: 101, webSocket: client });
}

function matchJson(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function matchErrorStatus(reason) {
  if (reason === 'match_ticket_auth_invalid') return 403;
  if (reason === 'match_queue_full') return 429;
  if (reason === 'match_client_already_waiting' || reason === 'match_idempotency_conflict') return 409;
  return 400;
}

async function readMatchJson(request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > 4096) throw new Error('match_request_too_large');
  const text = await request.text();
  if (text.length > 4096) throw new Error('match_request_too_large');
  return JSON.parse(text || '{}');
}

function randomMatchSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function refreshMatchAlarm(ctx, nowMs = Date.now()) {
  const service = await serviceStoredMatchTimeout(ctx.storage, {
    nowMs,
    generatedMatchId: `m-${crypto.randomUUID()}`,
  });
  if (!service.ok) throw new Error(service.reason || 'match_alarm_service_failed');

  const nextAlarmAt = Number.isSafeInteger(service.nextAlarmAt) ? service.nextAlarmAt : null;
  const scheduledAlarmAt = await ctx.storage.getAlarm();
  if (nextAlarmAt === null) {
    if (scheduledAlarmAt !== null) await ctx.storage.deleteAlarm();
  } else if (scheduledAlarmAt !== nextAlarmAt) {
    await ctx.storage.setAlarm(nextAlarmAt);
  }
  return service;
}

function publicMatchSession(status) {
  if (!status.match) return null;
  const seat = Array.isArray(status.match.seats)
    ? status.match.seats.find((candidate) => candidate?.kind === 'HUMAN' && candidate.ticketId === status.ticket.ticketId)
    : null;
  const slot = seat ? Number(seat.slot) : status.match.ticketIds.indexOf(status.ticket.ticketId);
  if (!Number.isInteger(slot) || slot < 0) return null;
  const size = Array.isArray(status.match.seats) && status.match.seats.length
    ? status.match.seats.length
    : status.match.ticketIds.length;
  const session = {
    sessionId: status.match.matchId,
    matchId: status.match.matchId,
    slot,
    size,
    format: status.match.format || '',
    aiSeatCount: Array.isArray(status.match.aiSeats) ? status.match.aiSeats.length : 0,
  };
  if (status.match.ruleset) session.ruleset = { ...status.match.ruleset };
  return session;
}

async function handleMatchRequest(ctx, request, url) {
  if (request.method !== 'POST') return matchJson({ ok: false, reason: 'match_method_invalid' }, 405);
  const op = url.searchParams.get('matchOp') || '';
  if (op !== 'create' && op !== 'status' && op !== 'cancel') {
    return matchJson({ ok: false, reason: 'match_op_invalid' }, 404);
  }

  let body;
  try {
    body = await readMatchJson(request);
  } catch {
    return matchJson({ ok: false, reason: 'match_request_invalid' }, 400);
  }

  if (op === 'create') {
    const nowMs = Date.now();
    const generated = {
      ticketId: `t-${crypto.randomUUID()}`,
      secret: randomMatchSecret(),
      matchId: `m-${crypto.randomUUID()}`,
      nowMs,
    };
    const preCreateTimeout = await serviceStoredMatchTimeout(ctx.storage, {
      nowMs,
      generatedMatchId: generated.matchId,
    });
    if (!preCreateTimeout.ok) {
      return matchJson({ ok: false, reason: preCreateTimeout.reason }, matchErrorStatus(preCreateTimeout.reason));
    }
    const result = await createStoredMatchTicket(ctx.storage, body, generated);
    if (!result.ok) return matchJson({ ok: false, reason: result.reason }, matchErrorStatus(result.reason));
    await refreshMatchAlarm(ctx, nowMs);
    return matchJson({
      ok: true,
      idempotent: result.idempotent,
      ticket: result.ticket,
      secret: result.secret,
      formedMatchId: result.formedMatchId,
    });
  }

  if (op === 'status') {
    const nowMs = Date.now();
    const result = await storedMatchTicketStatus(ctx.storage, body, {
      nowMs,
      generatedMatchId: `m-${crypto.randomUUID()}`,
    });
    if (!result.ok) return matchJson({ ok: false, reason: result.reason }, matchErrorStatus(result.reason));
    await refreshMatchAlarm(ctx, nowMs);
    return matchJson({ ok: true, ticket: result.ticket, session: publicMatchSession(result) });
  }

  const result = await cancelStoredMatchTicket(ctx.storage, body);
  if (!result.ok) return matchJson({ ok: false, reason: result.reason }, matchErrorStatus(result.reason));
  await refreshMatchAlarm(ctx);
  return matchJson({
    ok: true,
    cancelled: result.cancelled,
    terminal: result.terminal,
    ticket: result.ticket,
  });
}


function accountJson(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  });
}

function accountErrorStatus(reason) {
  if (reason === 'account_auth_invalid' || reason === 'account_session_unauthorized') return 403;
  if (reason === 'account_not_found_or_corrupt') return 404;
  if (reason === 'account_identity_conflict') return 409;
  if (reason === 'account_wallet_overflow') return 500;
  return 400;
}

async function readAccountJson(request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > 8192) throw new Error('account_request_too_large');
  const text = await request.text();
  if (text.length > 8192) throw new Error('account_request_too_large');
  return JSON.parse(text || '{}');
}

function randomOpaqueSecret(prefix) {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
  return `${prefix}_${encoded}`;
}

function exactPublicAccountId(value) {
  return typeof value === 'string' && /^acc_[0-9a-f]{32}$/i.test(value) ? value : null;
}

export class GAMEROADAccount extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
  }

  accountId() {
    return String(this.ctx.id.name || '');
  }

  async createAccount(input = {}) {
    return createPlayerAccount(this.ctx.storage, {
      accountId: this.accountId(),
      accountKey: input.accountKey,
    }, { nowMs: input.nowMs });
  }

  async issueSession(input = {}) {
    return issuePlayerSession(this.ctx.storage, {
      accountId: this.accountId(),
      accountKey: input.accountKey,
      sessionToken: input.sessionToken,
    }, { nowMs: input.nowMs });
  }

  async readAccount(input = {}) {
    return readPlayerAccount(this.ctx.storage, {
      accountId: this.accountId(),
      sessionToken: input.sessionToken,
    }, { nowMs: input.nowMs });
  }

  async claimInitialManii(input = {}) {
    return claimInitialManiiGrant(this.ctx.storage, {
      accountId: this.accountId(),
      sessionToken: input.sessionToken,
    }, { nowMs: input.nowMs });
  }

  async revokeSession(input = {}) {
    return revokePlayerSession(this.ctx.storage, {
      accountId: this.accountId(),
      sessionToken: input.sessionToken,
    }, { nowMs: input.nowMs });
  }
}

async function handleAccountRequest(env, request, url) {
  if (request.method === 'OPTIONS') return accountJson({ ok: true }, 204);
  if (request.method !== 'POST') return accountJson({ ok: false, reason: 'account_method_invalid' }, 405);
  if (!env?.GAMEROAD_ACCOUNT?.getByName) return accountJson({ ok: false, reason: 'account_service_unavailable' }, 503);

  const op = url.searchParams.get('accountOp') || '';
  if (!['create', 'session', 'state', 'claimInitialManii', 'revoke'].includes(op)) {
    return accountJson({ ok: false, reason: 'account_op_invalid' }, 404);
  }

  let body;
  try {
    body = await readAccountJson(request);
  } catch (error) {
    return accountJson({
      ok: false,
      reason: error?.message === 'account_request_too_large' ? 'account_request_too_large' : 'account_request_invalid',
    }, error?.message === 'account_request_too_large' ? 413 : 400);
  }

  const nowMs = Date.now();

  if (op === 'create') {
    let accountId;
    try {
      accountId = await derivePlayerAccountId(body.accountKey, crypto);
    } catch {
      return accountJson({ ok: false, reason: 'account_create_invalid' }, 400);
    }
    const stub = env.GAMEROAD_ACCOUNT.getByName(accountId);
    const created = await stub.createAccount({ accountKey: body.accountKey, nowMs });
    if (!created.ok) return accountJson(created, accountErrorStatus(created.reason));

    const sessionToken = randomOpaqueSecret('grs');
    const session = await stub.issueSession({ accountKey: body.accountKey, sessionToken, nowMs });
    if (!session.ok) return accountJson(session, accountErrorStatus(session.reason));

    const grant = await stub.claimInitialManii({ sessionToken, nowMs });
    if (!grant.ok) return accountJson(grant, accountErrorStatus(grant.reason));

    return accountJson({
      ok: true,
      accountId,
      created: created.created,
      idempotent: created.idempotent,
      sessionToken,
      sessionExpiresAtMs: session.expiresAtMs,
      initialGrant: {
        granted: grant.granted,
        idempotent: grant.idempotent,
        amount: grant.amount,
      },
      account: grant.account,
    });
  }

  const accountId = exactPublicAccountId(body.accountId);
  if (!accountId) return accountJson({ ok: false, reason: 'account_identity_invalid' }, 400);
  const stub = env.GAMEROAD_ACCOUNT.getByName(accountId);

  if (op === 'session') {
    let derived;
    try {
      derived = await derivePlayerAccountId(body.accountKey, crypto);
    } catch {
      return accountJson({ ok: false, reason: 'account_session_invalid' }, 400);
    }
    if (derived !== accountId) return accountJson({ ok: false, reason: 'account_auth_invalid' }, 403);
    const sessionToken = randomOpaqueSecret('grs');
    const result = await stub.issueSession({ accountKey: body.accountKey, sessionToken, nowMs });
    if (!result.ok) return accountJson(result, accountErrorStatus(result.reason));
    return accountJson({ ok: true, accountId, sessionToken, sessionExpiresAtMs: result.expiresAtMs });
  }

  if (op === 'state') {
    const result = await stub.readAccount({ sessionToken: body.sessionToken, nowMs });
    return accountJson(result, result.ok ? 200 : accountErrorStatus(result.reason));
  }

  if (op === 'claimInitialManii') {
    const result = await stub.claimInitialManii({ sessionToken: body.sessionToken, nowMs });
    return accountJson(result, result.ok ? 200 : accountErrorStatus(result.reason));
  }

  const result = await stub.revokeSession({ sessionToken: body.sessionToken, nowMs });
  return accountJson(result, result.ok ? 200 : accountErrorStatus(result.reason));
}

export class GAMEROADFriendRoomRelay extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      if (url.searchParams.has('reportOp')) return handlePartnerReportRequest(this.ctx.storage, request, url);
      if (url.searchParams.has('battleEventOp')) return handleBattleReceiptRequest(this.ctx.storage, request, url);
      if (url.searchParams.has('matchOp')) return handleMatchRequest(this.ctx, request, url);
      return new Response('WebSocket upgrade required', { status: 426, headers: { Upgrade: 'websocket' } });
    }
    const handshake = {
      channel: url.searchParams.get('channel') || '',
      role: url.searchParams.get('role') || '',
      clientId: url.searchParams.get('clientId') || '',
      authToken: url.searchParams.get('authToken') || '',
    };
    if (!parseChannel(handshake.channel)) return rejectSocket(this.ctx, 'transport_room_invalid');

    const stored = normalizeRoom(await this.ctx.storage.get(ROOM_KEY));
    const active = activeEntries(this.ctx);
    const admitted = admitConnection(stored, handshake, active);
    if (!admitted.ok) return rejectSocket(this.ctx, admitted.reason);

    await this.ctx.storage.put(ROOM_KEY, admitted.room);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(admitted.attachment);
    if (admitted.attachment.role === 'guest') {
      sendGuestPresence(this.ctx, admitted.room, admitted.attachment, 'rejoin', admitted.presenceRevision);
    }

    if (admitted.replaceHostClientId) {
      for (const entry of active) {
        if (entry.role !== 'host'
          || entry.clientId !== admitted.replaceHostClientId
          || entry.presenceClosed === true) continue;
        const prior = attachmentOf(entry.ws);
        if (!prior) continue;
        try {
          entry.ws.serializeAttachment({ ...prior, presenceClosed: true });
        } catch {
          continue;
        }
        try { entry.ws.close(1012, 'connection replaced'); } catch {}
      }
    }

    if (admitted.replaceClientId) {
      for (const entry of active) {
        if (entry.role === 'guest' && entry.clientId === admitted.replaceClientId) {
          try { entry.ws.close(1012, 'connection replaced'); } catch {}
        }
      }
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async alarm() {
    await refreshMatchAlarm(this.ctx, Date.now());
  }

  async webSocketMessage(ws, message) {
    const sender = attachmentOf(ws);
    if (!sender || sender.role === 'rejected' || sender.presenceClosed) return;
    let frame;
    try {
      if (typeof message !== 'string') throw new Error('binary frame unsupported');
      frame = JSON.parse(message);
    } catch {
      ws.send(JSON.stringify(transportReject('transport_frame_invalid')));
      return;
    }

    let room = normalizeRoom(await this.ctx.storage.get(ROOM_KEY));
    const active = activeEntries(this.ctx).filter((entry) => entry.presenceClosed !== true);
    const routed = routeFrame(room, sender, frame, active);
    if (!routed.ok) {
      ws.send(JSON.stringify(transportReject(routed.reason)));
      return;
    }

    room = routed.room;
    if (sender.role === 'guest' && (routed.frame.payload.type === 'sync' || routed.frame.payload.type === 'leave')) {
      const advanced = bumpGuestPresenceRevision(room, sender.clientId);
      if (!advanced.ok) {
        ws.send(JSON.stringify(transportReject(advanced.reason)));
        return;
      }
      room = advanced.room;
      sendGuestPresence(
        this.ctx,
        room,
        sender,
        routed.frame.payload.type === 'leave' ? 'disconnect' : 'sync',
        advanced.revision,
      );
    }

    const out = JSON.stringify(routed.frame);
    for (const targetId of routed.targets) {
      const target = active.find((x) => x.role !== sender.role && x.clientId === targetId);
      if (!target) continue;
      if (routed.bindAuthToken && target.role === 'guest') {
        const next = { ...target, ws: undefined, authToken: routed.bindAuthToken };
        delete next.ws;
        target.ws.serializeAttachment(next);
      }
      target.ws.send(out);
    }

    if (routed.promoteAuthToken) {
      ws.serializeAttachment({ ...sender, authToken: routed.promoteAuthToken });
    }
    if (routed.removeGuestAfterSend) {
      delete room.guests[routed.removeGuestAfterSend];
      ws.serializeAttachment({ ...sender, presenceClosed: true });
    }
    await this.ctx.storage.put(ROOM_KEY, room);
  }

  async webSocketClose(ws, code) {
    const sender = attachmentOf(ws);
    if (!sender || sender.role === 'rejected' || sender.presenceClosed) return;
    const room = normalizeRoom(await this.ctx.storage.get(ROOM_KEY));
    if (sender.role === 'guest') {
      const replacementAlive = activeEntries(this.ctx).some(
        (entry) => entry.ws !== ws && entry.role === 'guest' && entry.clientId === sender.clientId && !entry.presenceClosed
      );
      ws.serializeAttachment({ ...sender, presenceClosed: true });
      if (replacementAlive || !room.guests[sender.clientId]) return;
      const advanced = bumpGuestPresenceRevision(room, sender.clientId);
      if (!advanced.ok) return;
      sendGuestPresence(this.ctx, advanced.room, sender, 'disconnect', advanced.revision);
      await this.ctx.storage.put(ROOM_KEY, advanced.room);
      return;
    }
    if (sender.role === 'host' && room.hostClientId === sender.clientId) {
      ws.serializeAttachment({ ...sender, presenceClosed: true });
      if (shouldPreserveRoomAfterHostClose(code)) return;
      for (const entry of activeEntries(this.ctx)) {
        if (entry.ws === ws || entry.role !== 'guest' || entry.presenceClosed === true) continue;
        try { entry.ws.close(1012, 'host disconnected'); } catch {}
      }
      await this.ctx.storage.put(ROOM_KEY, emptyRoom());
    }
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws, 1006);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.searchParams.has('accountOp')) return handleAccountRequest(env, request, url);
    return new Response(`GAMEROAD ${WS_WIRE} Durable Object worker`, { status: 404 });
  },
};
