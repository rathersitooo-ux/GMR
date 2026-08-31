import {
  MATCH_TICKET_WAITING,
  MATCH_TICKET_MATCHED,
  MAX_WAITING_TICKETS,
  createMatchTicket,
  emptyMatchQueue,
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
export const MATCH_HUMAN_PRIORITY_MS = 60_000;
export const NEW_BASE_MATCH_RULESET = Object.freeze({ id: 'NEW_BASE_BATTLE', version: 1 });
export const NEW_BASE_MATCH_STATE_SCHEMA = 'gameroad.newbase.matchstate.v1';

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
function safeNowMs(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : Date.now();
}
function safeStoredAtMs(value, fallback) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : fallback;
}

export function normalizeMatchRulesetEnvelope(raw) {
  if (raw === undefined || raw === null) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('generated_match_ruleset_invalid');
  }
  if (raw.id !== NEW_BASE_MATCH_RULESET.id || raw.version !== NEW_BASE_MATCH_RULESET.version) {
    throw new TypeError('generated_match_ruleset_invalid');
  }
  return { id: NEW_BASE_MATCH_RULESET.id, version: NEW_BASE_MATCH_RULESET.version };
}

export function createNewBaseMatchStateSkeleton() {
  return {
    schema: NEW_BASE_MATCH_STATE_SCHEMA,
    ruleset: { ...NEW_BASE_MATCH_RULESET },
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
  return {
    ticketId,
    secret,
    matchId,
    nowMs: safeNowMs(generated?.nowMs),
    ruleset: normalizeMatchRulesetEnvelope(generated?.ruleset),
  };
}

function orderedWaitingEntries(tickets) {
  return Object.entries(tickets || {})
    .filter(([, ticket]) => ticket?.status === MATCH_TICKET_WAITING)
    .sort((a, b) => Number(a[1].sequence || 0) - Number(b[1].sequence || 0) || a[0].localeCompare(b[0]));
}

function seatRecord(ticketIds, tickets, aiCount, format) {
  const seats = ticketIds.map((ticketId, slot) => ({
    slot,
    kind: 'HUMAN',
    ticketId,
    clientId: String(tickets[ticketId]?.clientId || ''),
    team: format === 'TEAM2V2' ? 0 : null,
  }));
  const aiSeats = [];
  for (let i = 0; i < aiCount; i += 1) {
    const slot = seats.length;
    aiSeats.push(slot);
    seats.push({
      slot,
      kind: 'AI',
      aiId: `AI${i + 1}`,
      team: format === 'TEAM2V2' ? 1 : null,
    });
  }
  return { seats, aiSeats };
}

function buildMatchRecord(matchId, ticketIds, tickets, aiCount, format, fillReason, startedAtMs, ruleset = null) {
  const seatData = seatRecord(ticketIds, tickets, aiCount, format);
  const record = {
    matchId,
    ticketIds: [...ticketIds],
    aiSeats: seatData.aiSeats,
    seats: seatData.seats,
    format,
    fillReason,
    startedAtMs,
  };
  if (ruleset) {
    record.ruleset = { ...ruleset };
    record.state = createNewBaseMatchStateSkeleton();
  }
  return record;
}

function publicStoredMatch(matchId, raw) {
  if (!raw || typeof raw !== 'object') return null;
  const ticketIds = Array.isArray(raw.ticketIds) ? raw.ticketIds.filter(validMatchTicketId) : [];
  if (!ticketIds.length) return null;
  let ruleset = null;
  try {
    ruleset = normalizeMatchRulesetEnvelope(raw.ruleset);
  } catch {
    return null;
  }
  const aiSeats = Array.isArray(raw.aiSeats)
    ? raw.aiSeats.filter((slot) => Number.isInteger(slot) && slot >= 0 && slot < 4)
    : [];
  const seats = Array.isArray(raw.seats) && raw.seats.length === 4
    ? raw.seats.map((seat, slot) => ({ ...seat, slot }))
    : ticketIds.map((ticketId, slot) => ({ slot, kind: 'HUMAN', ticketId, team: null }));
  const match = {
    matchId,
    ticketIds,
    aiSeats,
    seats,
    format: String(raw.format || (ticketIds.length === 4 ? 'FREE4P' : '')),
    fillReason: String(raw.fillReason || (ticketIds.length === 4 ? 'HUMAN_QUORUM' : '')),
    startedAtMs: Number.isSafeInteger(raw.startedAtMs) ? raw.startedAtMs : 0,
  };
  if (ruleset) match.ruleset = ruleset;
  return match;
}

async function stampMissingWaitingTimes(txn, snapshot, nowMs) {
  for (const [ticketId, ticket] of Object.entries(snapshot.queue.tickets)) {
    if (Number.isSafeInteger(ticket.enqueuedAtMs) && ticket.enqueuedAtMs >= 0) continue;
    const stamped = { ...ticket, enqueuedAtMs: nowMs };
    snapshot.queue.tickets[ticketId] = stamped;
    txn.put(ticketKey(ticketId), stamped);
  }
}

async function formTimedOutMatch(txn, tickets, nowMs, generatedMatchId, ruleset = null) {
  const waiting = orderedWaitingEntries(tickets);
  if (waiting.length < 2 || waiting.length > 3) return null;
  const oldestAt = safeStoredAtMs(waiting[0][1].enqueuedAtMs, nowMs);
  if (nowMs - oldestAt < MATCH_HUMAN_PRIORITY_MS) return null;
  if (!validMatchId(generatedMatchId)) return null;
  if (await txn.get(matchKey(generatedMatchId)) !== undefined) throw new TypeError('generated_match_id_collision');

  const ticketIds = waiting.map(([ticketId]) => ticketId);
  const format = ticketIds.length === 2 ? 'TEAM2V2' : 'FREE4P';
  const aiCount = 4 - ticketIds.length;
  const matchedTickets = { ...tickets };
  for (const ticketId of ticketIds) {
    const ticket = {
      ...matchedTickets[ticketId],
      status: MATCH_TICKET_MATCHED,
      matchId: generatedMatchId,
    };
    matchedTickets[ticketId] = ticket;
    txn.put(ticketKey(ticketId), ticket);
    txn.delete(waitingKey(ticket.sequence, ticketId));
    txn.delete(clientWaitingKey(ticket.clientId));
  }
  const match = buildMatchRecord(
    generatedMatchId,
    ticketIds,
    matchedTickets,
    aiCount,
    format,
    'HUMAN_PRIORITY_TIMEOUT',
    nowMs,
    ruleset,
  );
  txn.put(matchKey(generatedMatchId), match);
  return { match, matchedTickets };
}

function nextStoredMatchAlarmAt(tickets) {
  const waiting = orderedWaitingEntries(tickets);
  if (waiting.length < 2 || waiting.length > 3) return null;
  const oldestAt = safeStoredAtMs(waiting[0][1].enqueuedAtMs, 0);
  return oldestAt + MATCH_HUMAN_PRIORITY_MS;
}

export async function serviceStoredMatchTimeout(storage, runtime = {}) {
  const nowMs = safeNowMs(runtime?.nowMs);
  const generatedMatchId = String(runtime?.generatedMatchId || '');
  const ruleset = normalizeMatchRulesetEnvelope(runtime?.ruleset);

  return storage.transaction(async (txn) => {
    const snapshot = await waitingSnapshot(txn);
    if (!snapshot.ok) return reject(snapshot.reason);
    for (const staleKey of snapshot.staleKeys) txn.delete(staleKey);
    await stampMissingWaitingTimes(txn, snapshot, nowMs);

    const timeout = await formTimedOutMatch(txn, snapshot.queue.tickets, nowMs, generatedMatchId, ruleset);
    if (timeout) {
      return {
        ok: true,
        formedMatchId: timeout.match.matchId,
        match: publicStoredMatch(timeout.match.matchId, timeout.match),
        nextAlarmAt: null,
      };
    }

    return {
      ok: true,
      formedMatchId: '',
      match: null,
      nextAlarmAt: nextStoredMatchAlarmAt(snapshot.queue.tickets),
    };
  });
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
    await stampMissingWaitingTimes(txn, snapshot, ids.nowMs);
    if (Object.keys(snapshot.queue.tickets).length >= MAX_WAITING_TICKETS) return reject('match_queue_full');

    const meta = safeMeta(await txn.get(MATCH_STORAGE_META_KEY));
    snapshot.queue.nextSequence = meta.nextSequence;
    if (Object.keys(snapshot.queue.tickets).length + 1 >= 4 && await txn.get(matchKey(ids.matchId)) !== undefined) {
      throw new TypeError('generated_match_id_collision');
    }

    const result = createMatchTicket(snapshot.queue, input, ids);
    if (!result.ok) return reject(result.reason);

    const newTicketId = result.ticket.ticketId;
    const newTicket = { ...result.queue.tickets[newTicketId], enqueuedAtMs: ids.nowMs };
    txn.put(MATCH_STORAGE_META_KEY, { schema: MATCH_STORAGE_SCHEMA, nextSequence: result.queue.nextSequence });
    txn.put(idempotencyKey(idem), newTicketId);

    if (!result.formedMatchId) {
      const waitingTickets = { ...snapshot.queue.tickets, [newTicketId]: newTicket };
      const timeout = await formTimedOutMatch(txn, waitingTickets, ids.nowMs, ids.matchId, ids.ruleset);
      if (!timeout) {
        txn.put(ticketKey(newTicketId), newTicket);
        txn.put(waitingKey(newTicket.sequence, newTicketId), newTicketId);
        txn.put(clientWaitingKey(newTicket.clientId), newTicketId);
        return {
          ok: true,
          idempotent: false,
          ticket: publicTicket(newTicketId, newTicket),
          secret: result.secret,
          formedMatchId: '',
        };
      }
      const matchedNew = timeout.matchedTickets[newTicketId];
      return {
        ok: true,
        idempotent: false,
        ticket: publicTicket(newTicketId, matchedNew),
        secret: result.secret,
        formedMatchId: timeout.match.matchId,
      };
    }

    const selected = result.queue.matches[result.formedMatchId].ticketIds;
    const persisted = {};
    for (const ticketId of selected) {
      const ticket = {
        ...(snapshot.queue.tickets[ticketId] || {}),
        ...result.queue.tickets[ticketId],
        enqueuedAtMs: safeStoredAtMs(
          snapshot.queue.tickets[ticketId]?.enqueuedAtMs,
          ticketId === newTicketId ? ids.nowMs : ids.nowMs,
        ),
      };
      persisted[ticketId] = ticket;
      txn.put(ticketKey(ticketId), ticket);
      txn.delete(waitingKey(ticket.sequence, ticketId));
      txn.delete(clientWaitingKey(ticket.clientId));
    }
    txn.put(matchKey(result.formedMatchId), buildMatchRecord(
      result.formedMatchId,
      selected,
      persisted,
      0,
      'FREE4P',
      'HUMAN_QUORUM',
      ids.nowMs,
      ids.ruleset,
    ));

    return {
      ok: true,
      idempotent: false,
      ticket: publicTicket(newTicketId, persisted[newTicketId]),
      secret: result.secret,
      formedMatchId: result.formedMatchId,
    };
  });
}

export async function storedMatchTicketStatus(storage, input, runtime = {}) {
  const ticketId = String(input?.ticketId || '');
  const secret = String(input?.secret || '');
  if (!validMatchTicketId(ticketId) || !validMatchSecret(secret)) return reject('match_ticket_auth_invalid');
  const nowMs = safeNowMs(runtime?.nowMs);
  const generatedMatchId = String(runtime?.generatedMatchId || '');
  const ruleset = normalizeMatchRulesetEnvelope(runtime?.ruleset);

  return storage.transaction(async (txn) => {
    let ticket = await txn.get(ticketKey(ticketId));
    if (!ticket || ticket.secret !== secret) return reject('match_ticket_auth_invalid');

    if (ticket.status === MATCH_TICKET_WAITING) {
      const snapshot = await waitingSnapshot(txn);
      if (!snapshot.ok) return reject(snapshot.reason);
      for (const staleKey of snapshot.staleKeys) txn.delete(staleKey);
      await stampMissingWaitingTimes(txn, snapshot, nowMs);
      const timeout = await formTimedOutMatch(txn, snapshot.queue.tickets, nowMs, generatedMatchId, ruleset);
      if (timeout?.matchedTickets[ticketId]) ticket = timeout.matchedTickets[ticketId];
      else ticket = snapshot.queue.tickets[ticketId] || ticket;
    }

    let match = null;
    if (ticket.status === MATCH_TICKET_MATCHED && validMatchId(ticket.matchId)) {
      match = publicStoredMatch(ticket.matchId, await txn.get(matchKey(ticket.matchId)));
    }
    return { ok: true, ticket: publicTicket(ticketId, ticket), match };
  });
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
