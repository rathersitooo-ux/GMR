import { DurableObject } from 'cloudflare:workers';
import {
  WS_WIRE,
  admitConnection,
  emptyRoom,
  normalizeRoom,
  parseChannel,
  routeFrame,
  transportReject,
  makeTransportPresenceFrame,
} from './relay-core.mjs';

const ROOM_KEY = 'room.v1';

function attachmentOf(ws) {
  try { return ws.deserializeAttachment() || null; } catch { return null; }
}

function activeEntries(ctx) {
  return ctx.getWebSockets().map((ws) => ({ ws, ...(attachmentOf(ws) || {}) }));
}

function sendGuestPresence(ctx, room, sender, kind) {
  const host = activeEntries(ctx).find(
    (entry) => entry.role === 'host' && entry.clientId === room.hostClientId
  );
  if (!host) return false;
  try {
    host.ws.send(JSON.stringify(makeTransportPresenceFrame(sender.code, sender.clientId, kind)));
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

export class GAMEROADFriendRoomRelay extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
  }

  async fetch(request) {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('WebSocket upgrade required', { status: 426, headers: { Upgrade: 'websocket' } });
    }
    const url = new URL(request.url);
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

    if (admitted.replaceClientId) {
      for (const entry of active) {
        if (entry.role === 'guest' && entry.clientId === admitted.replaceClientId) {
          try { entry.ws.close(1012, 'connection replaced'); } catch {}
        }
      }
    }

    await this.ctx.storage.put(ROOM_KEY, admitted.room);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(admitted.attachment);
    if (admitted.attachment.role === 'guest') {
      sendGuestPresence(this.ctx, admitted.room, admitted.attachment, 'rejoin');
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    const sender = attachmentOf(ws);
    if (!sender || sender.role === 'rejected') return;
    let frame;
    try {
      if (typeof message !== 'string') throw new Error('binary frame unsupported');
      frame = JSON.parse(message);
    } catch {
      ws.send(JSON.stringify(transportReject('transport_frame_invalid')));
      return;
    }

    let room = normalizeRoom(await this.ctx.storage.get(ROOM_KEY));
    const active = activeEntries(this.ctx);
    const routed = routeFrame(room, sender, frame, active);
    if (!routed.ok) {
      ws.send(JSON.stringify(transportReject(routed.reason)));
      return;
    }

    room = routed.room;
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
    }
    await this.ctx.storage.put(ROOM_KEY, room);
  }

  async webSocketClose(ws) {
    const sender = attachmentOf(ws);
    if (!sender || sender.role === 'rejected') return;
    const room = normalizeRoom(await this.ctx.storage.get(ROOM_KEY));
    if (sender.role === 'guest') {
      const replacementAlive = activeEntries(this.ctx).some(
        (entry) => entry.ws !== ws && entry.role === 'guest' && entry.clientId === sender.clientId
      );
      if (!replacementAlive && room.guests[sender.clientId]) {
        sendGuestPresence(this.ctx, room, sender, 'disconnect');
      }
      return;
    }
    if (sender.role === 'host' && room.hostClientId === sender.clientId) {
      for (const entry of activeEntries(this.ctx)) {
        if (entry.ws === ws || entry.role !== 'guest') continue;
        try { entry.ws.close(1012, 'host disconnected'); } catch {}
      }
      await this.ctx.storage.put(ROOM_KEY, emptyRoom());
    }
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }
}

export default {
  fetch() {
    return new Response(`GAMEROAD ${WS_WIRE} Durable Object worker`, { status: 404 });
  },
};
