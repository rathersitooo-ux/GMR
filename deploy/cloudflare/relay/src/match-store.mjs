import {
  MATCH_TICKET_WAITING,
  MATCH_TICKET_MATCHED,
  MAX_WAITING_TICKETS,
  createMatchTicket,
  emptyMatchQueue,
  matchTicketStatus,
  cancelMatchTicket,
  validMatchClientId,
  validMatchIdempotencyKey,
  validMatchTicketId,
  validMatchId,
  validMatchSecret,
} from './relay-core.mjs';

export const MATCH_STORAGE_SCHEMA = 'gameroad.normalmatch.storage.v2';
export const MATCH_STORAGE_META_KEY = 'match/meta/v2';
export const MATCH_TICKET_PREFIX = 'match/ticket/';
export const MATCH_IDEMPOTENCY_PREFIX = 'match/idempotency/';
export const MATCH_WAITING_PREFIX = 'match/waiting/';
export const MATCH_CLIENT_WAITING_PREFIX = 'match/client-waiting/';
export const MATCH_RECORD_PREFIX = 'match/record/';

function enc(value) { return encodeURIComponent(String(value)); }
function ticketKey(ticketId) { return `${MATCH_TICKET_PREFIX}${enc(ticketId)}`; }
function idempotencyKey(key) { return `${MATCH_IDEMPOTENCY_PREFIX}${enc(key)}`; }
function clientWaitingKey(clientId) { return `${MATCH_CLIENT_WAITING_PREFIX}${enc(clientId)}`; }
function matchKey(matchId) { return `${MATCH_RECORD_PREFIX}${enc(matchId)}`; }
function waitingKey(sequence, ticketId) {
  return `${MATCH_WAITING_PREFIX}${String(sequence).padStart(20, '0')}:${enc(ticketId)}`;
}

function reject(reason) { return { ok: false, reason }; }
function publicTicket(ticketId, ticket) {
  return { ticketId, clientId: ticket.clientId, status: ticket.status, matchId: ticket.matchId || '' };
}
function safeMeta(raw) {
  return {
    schema: MATCH_STORAGE_SCHEMA,
    nextSequence: Number.isSafeInteger(raw?.nextSequence) && raw.nextSequence > 0 ? raw.nextSequence : 1,
  };
}

async function getMany(txn, keys) {
  if (!keys.length) return new Map();
  const value = await txn.get(keys);
  if (value instanceof Map) return value;
  const out = new Map();
  for (const key of keys) {
    const item = await txn.get(key);
    if (item !== undefined) out.set(key, item);
  }
  return out;
}

async function waitingSnapshot(txn) {
  const listed = await txn.list({ prefix: MATCH_WAITING_PREFIX, limit: MAX_WAITING_TICKETS + 1 });
  if (listed.size > MAX_WAITING_TICKETS) return { ok: false, reason: 'match_queue_full' };
  const markerEntries = [...listed.entries()];
  const ticketIds = markerEntries.map(([, ticketId]) => String(ticketId || ''));
  const keys = ticketIds.filter(validMatchTicketId).map(ticketKey);
  const records = await getMany(txn, keys);
  const queue = emptyMatchQueue();
  const staleKeys = [];
  for (let i = 0; i < markerEntries.length; i += 1) {
    const [markerKey, markerTicketId] = markerEntries[i];
    const ticketId = String(markerTicketId || '');
    const ticket = records.get(ticketKey(ticketId));
    if (!validMatchTicketId(ticketId) || !ticket || ticket.status !== MATCH_TICKET_WAITING) {
      staleKeys.push(markerKey);
      continue;
    }
    queue.tickets[ticketId] = ticket;
  }
  return { ok: true, queue, staleKeys };
}

function ensureGenerated(generated) {
  const ticketId = String(generated?.ticketId || '');
  const secret = String(generated?.secret || '');
  const matchId = String(generated?.matchId || '');
  if (!validMatchTicketId(ticketId)) throw new TypeError('generated_ticket_id_invalid');
  if (!validMatchSecret(secret)) throw new TypeError('generated_ticket_secret_invalid');
  if (matchId && !validMatchId(matchId)) throw new TypeError('generated_match_id_invalid');
  return { ticketId, secret, matchId };
}

export async function createStoredMatchTicket(storage, input, generated) {
  const clientId = String(input?.clientId || '');
  const idem = String(input?.idempotencyKey || '');
  if (!validMatchClientId(clientId)) return reject('match_client_invalid');
  if (!validMatchIdempotencyKey(idem)) return reject('match_idempotency_invalid');
  const ids = ensureGenerated(generated);

  return storage.transaction(async (txn) => {
    const priorTicketId = await txn.get(idempotencyKey(idem));
    if (priorTicketId !== undefined) {
      const ticketId = String(priorTicketId || '');
      const ticket = validMatchTicketId(ticketId) ? await txn.get(ticketKey(ticketId)) : undefined;
      if (!ticket || ticket.clientId !== clientId) return reject('match_idempotency_conflict');
      return {
        ok: true,
        idempotent: true,
        ticket: publicTicket(ticketId, ticket),
        secret: ticket.secret,
        formedMatchId: '',
      };
    }

    const existingWaiting = await txn.get(clientWaitingKey(clientId));
    if (existingWaiting !== undefined) return reject('match_client_already_waiting');
    if (await txn.get(ticketKey(ids.ticketId)) !== undefined) throw new TypeError('generated_ticket_id_collision');

    const snapshot = await waitingSnapshot(txn);
    if (!snapshot.ok) return reject(snapshot.reason);
    for (const staleKey of snapshot.staleKeys) txn.delete(staleKey);
    if (Object.keys(snapshot.queue.tickets).length >= MAX_WAITING_TICKETS) return reject('match_queue_full');

    const meta = safeMeta(await txn.get(MATCH_STORAGE_META_KEY));
    snapshot.queue.nextSequence = meta.nextSequence;
    if (Object.keys(snapshot.queue.tickets).length + 1 >= 4 && await txn.get(matchKey(ids.matchId)) !== undefined) {
      throw new TypeError('generated_match_id_collision');
    }

    const result = createMatchTicket(snapshot.queue, input, ids);
    if (!result.ok) return reject(result.reason);

    const newTicketId = result.ticket.ticketId;
    const newTicket = result.queue.tickets[newTicketId];
    txn.put(MATCH_STORAGE_META_KEY, { schema: MATCH_STORAGE_SCHEMA, nextSequence: result.queue.nextSequence });
    txn.put(idempotencyKey(idem), newTicketId);

    if (!result.formedMatchId) {
      txn.put(ticketKey(newTicketId), newTicket);
      txn.put(waitingKey(newTicket.sequence, newTicketId), newTicketId);
      txn.put(clientWaitingKey(newTicket.clientId), newTicketId);
    } else {
      const selected = result.queue.matches[result.formedMatchId].ticketIds;
      for (const ticketId of selected) {
        const ticket = result.queue.tickets[ticketId];
        txn.put(ticketKey(ticketId), ticket);
        txn.delete(waitingKey(ticket.sequence, ticketId));
        txn.delete(clientWaitingKey(ticket.clientId));
      }
      txn.put(matchKey(result.formedMatchId), { ticketIds: [...selected] });
    }

    return {
      ok: true,
      idempotent: false,
      ticket: result.ticket,
      secret: result.secret,
      formedMatchId: result.formedMatchId,
    };
  });
}

export async function storedMatchTicketStatus(storage, input) {
  const ticketId = String(input?.ticketId || '');
  const secret = String(input?.secret || '');
  if (!validMatchTicketId(ticketId) || !validMatchSecret(secret)) return reject('match_ticket_auth_invalid');
  const ticket = await storage.get(ticketKey(ticketId));
  if (!ticket) return reject('match_ticket_auth_invalid');
  const queue = emptyMatchQueue();
  queue.tickets[ticketId] = ticket;
  if (ticket.status === MATCH_TICKET_MATCHED && validMatchId(ticket.matchId)) {
    const match = await storage.get(matchKey(ticket.matchId));
    if (match?.ticketIds?.length) {
      const peerKeys = match.ticketIds.filter(validMatchTicketId).map(ticketKey);
      const peers = await getMany(storage, peerKeys);
      for (const peerId of match.ticketIds) {
        const peer = peers.get(ticketKey(peerId));
        if (peer) queue.tickets[peerId] = peer;
      }
      queue.matches[ticket.matchId] = match;
    }
  }
  const result = matchTicketStatus(queue, input);
  if (!result.ok) return reject(result.reason);
  return { ok: true, ticket: result.ticket, match: result.match };
}

export async function cancelStoredMatchTicket(storage, input) {
  const ticketId = String(input?.ticketId || '');
  const secret = String(input?.secret || '');
  if (!validMatchTicketId(ticketId) || !validMatchSecret(secret)) return reject('match_ticket_auth_invalid');

  return storage.transaction(async (txn) => {
    const ticket = await txn.get(ticketKey(ticketId));
    if (!ticket) return reject('match_ticket_auth_invalid');
    const queue = emptyMatchQueue();
    queue.tickets[ticketId] = ticket;
    const result = cancelMatchTicket(queue, input);
    if (!result.ok) return reject(result.reason);
    if (ticket.status === MATCH_TICKET_WAITING && result.ticket.status !== MATCH_TICKET_WAITING) {
      const updated = result.queue.tickets[ticketId];
      txn.put(ticketKey(ticketId), updated);
      txn.delete(waitingKey(ticket.sequence, ticketId));
      const currentClientTicket = await txn.get(clientWaitingKey(ticket.clientId));
      if (String(currentClientTicket || '') === ticketId) txn.delete(clientWaitingKey(ticket.clientId));
    }
    return {
      ok: true,
      cancelled: result.cancelled,
      terminal: result.terminal,
      ticket: result.ticket,
    };
  });
}

export const matchStorageKeysForTest = Object.freeze({
  ticketKey,
  idempotencyKey,
  clientWaitingKey,
  matchKey,
  waitingKey,
});
