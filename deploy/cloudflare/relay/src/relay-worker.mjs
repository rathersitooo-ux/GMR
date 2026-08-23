import { DurableObject } from 'cloudflare:workers';
import {
  WS_WIRE,
  admitConnection,
  bumpGuestPresenceRevision,
  cancelMatchTicket,
  createMatchTicket,
  emptyRoom,
  makeTransportPresenceFrame,
  matchTicketStatus,
  normalizeMatchQueue,
  normalizeRoom,
  parseChannel,
  routeFrame,
  shouldPreserveRoomAfterHostClose,
  transportReject,
} from './relay-core.mjs';

const ROOM_KEY = 'room.v1';
const MATCH_QUEUE_KEY = 'match-queue.v1';

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

function publicMatchSession(status) {
  if (!status.match) return null;
  const slot = status.match.ticketIds.indexOf(status.ticket.ticketId);
  if (slot < 0) return null;
  return {
    sessionId: status.match.matchId,
    matchId: status.match.matchId,
    slot,
    size: status.match.ticketIds.length,
  };
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

  const stored = normalizeMatchQueue(await ctx.storage.get(MATCH_QUEUE_KEY));
  if (op === 'create') {
    const result = createMatchTicket(stored, body, {
      ticketId: `t-${crypto.randomUUID()}`,
      secret: randomMatchSecret(),
      matchId: `m-${crypto.randomUUID()}`,
    });
    if (!result.ok) return matchJson({ ok: false, reason: result.reason }, matchErrorStatus(result.reason));
    await ctx.storage.put(MATCH_QUEUE_KEY, result.queue);
    return matchJson({
      ok: true,
      idempotent: result.idempotent,
      ticket: result.ticket,
      secret: result.secret,
      formedMatchId: result.formedMatchId,
    });
  }

  if (op === 'status') {
    const result = matchTicketStatus(stored, body);
    if (!result.ok) return matchJson({ ok: false, reason: result.reason }, matchErrorStatus(result.reason));
    return matchJson({ ok: true, ticket: result.ticket, session: publicMatchSession(result) });
  }

  const result = cancelMatchTicket(stored, body);
  if (!result.ok) return matchJson({ ok: false, reason: result.reason }, matchErrorStatus(result.reason));
  await ctx.storage.put(MATCH_QUEUE_KEY, result.queue);
  return matchJson({
    ok: true,
    cancelled: result.cancelled,
    terminal: result.terminal,
    ticket: result.ticket,
  });
}

export class GAMEROADFriendRoomRelay extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
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
  fetch() {
    return new Response(`GAMEROAD ${WS_WIRE} Durable Object worker`, { status: 404 });
  },
};
