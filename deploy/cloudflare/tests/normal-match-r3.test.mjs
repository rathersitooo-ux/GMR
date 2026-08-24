import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MATCH_HUMAN_PRIORITY_MS,
  MATCH_STORAGE_META_KEY,
  MATCH_WAITING_PREFIX,
  createStoredMatchTicket,
  storedMatchTicketStatus,
  cancelStoredMatchTicket,
} from '../relay/src/match-store.mjs';

class FakeStorage {
  constructor() { this.map = new Map(); this.listPrefixes = []; }
  async get(key) {
    if (Array.isArray(key)) {
      const out = new Map();
      for (const k of key) if (this.map.has(k)) out.set(k, structuredClone(this.map.get(k)));
      return out;
    }
    return this.map.has(key) ? structuredClone(this.map.get(key)) : undefined;
  }
  async put(key, value) { this.map.set(key, structuredClone(value)); }
  async delete(key) { return this.map.delete(key); }
  async list({ prefix = '', limit = Number.MAX_SAFE_INTEGER } = {}) {
    this.listPrefixes.push(prefix);
    return new Map([...this.map.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, limit)
      .map(([key, value]) => [key, structuredClone(value)]));
  }
  async transaction(fn) {
    const before = structuredClone([...this.map.entries()]);
    try { return await fn(this); }
    catch (error) { this.map = new Map(before); throw error; }
  }
}

let sequence = 0;
function generated(nowMs = undefined) {
  sequence += 1;
  return {
    ticketId: `t-${String(sequence).padStart(6, '0')}`,
    secret: `0123456789abcdef0123456789abcdef${String(sequence).padStart(8, '0')}`,
    matchId: `m-${String(Math.ceil(sequence / 4)).padStart(6, '0')}`,
    ...(Number.isSafeInteger(nowMs) ? { nowMs } : {}),
  };
}
function idem(n) { return `idem-key-${String(n).padStart(8, '0')}`; }
async function create(storage, n, client = `c-${n}`, nowMs = undefined) {
  return createStoredMatchTicket(storage, { clientId: client, idempotencyKey: idem(n) }, generated(nowMs));
}

function statusRuntime(nowMs, suffix) {
  return { nowMs, generatedMatchId: `m-runtime-${suffix}` };
}

test('per-record storage preserves idempotent create and one WAITING membership per client', async () => {
  const storage = new FakeStorage();
  const first = await create(storage, 1, 'alice');
  assert.equal(first.ok, true);
  assert.equal(first.ticket.status, 'WAITING');
  const duplicate = await createStoredMatchTicket(storage, { clientId: 'alice', idempotencyKey: idem(1) }, generated());
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.idempotent, true);
  assert.equal(duplicate.ticket.ticketId, first.ticket.ticketId);
  const secondKey = await create(storage, 2, 'alice');
  assert.equal(secondKey.ok, false);
  assert.equal(secondKey.reason, 'match_client_already_waiting');
});

test('four humans form one immediate atomic match and remove all WAITING index membership', async () => {
  const storage = new FakeStorage();
  const startedAt = 10_000;
  const results = [];
  for (let i = 1; i <= 4; i += 1) results.push(await create(storage, i, `human-${i}`, startedAt + i));
  assert.equal(results[3].formedMatchId.startsWith('m-'), true);
  assert.equal((await storage.list({ prefix: MATCH_WAITING_PREFIX })).size, 0);
  for (const result of results) {
    const status = await storedMatchTicketStatus(storage, { ticketId: result.ticket.ticketId, secret: result.secret });
    assert.equal(status.ok, true);
    assert.equal(status.ticket.status, 'MATCHED');
    assert.equal(status.match.ticketIds.length, 4);
    assert.equal(status.match.seats.length, 4);
    assert.equal(status.match.aiSeats.length, 0);
    assert.equal(status.match.fillReason, 'HUMAN_QUORUM');
  }
});

test('formal 60s human priority keeps three humans waiting before the boundary then fills exactly one AI seat', async () => {
  const storage = new FakeStorage();
  const startedAt = 100_000;
  const humans = [];
  for (let i = 0; i < 3; i += 1) humans.push(await create(storage, 8000 + i, `timeout3-${i}`, startedAt + i * 100));

  const before = await storedMatchTicketStatus(
    storage,
    { ticketId: humans[0].ticket.ticketId, secret: humans[0].secret },
    statusRuntime(startedAt + MATCH_HUMAN_PRIORITY_MS - 1, 'timeout3-before'),
  );
  assert.equal(before.ticket.status, 'WAITING');
  assert.equal(before.match, null);

  const due = await storedMatchTicketStatus(
    storage,
    { ticketId: humans[0].ticket.ticketId, secret: humans[0].secret },
    statusRuntime(startedAt + MATCH_HUMAN_PRIORITY_MS, 'timeout3-due'),
  );
  assert.equal(due.ticket.status, 'MATCHED');
  assert.equal(due.match.ticketIds.length, 3);
  assert.equal(due.match.aiSeats.length, 1);
  assert.equal(due.match.format, 'FREE4P');
  assert.equal(due.match.fillReason, 'HUMAN_PRIORITY_TIMEOUT');
  assert.equal(due.match.seats.length, 4);
  assert.equal(due.match.seats.filter((seat) => seat.kind === 'HUMAN').length, 3);
  assert.equal(due.match.seats.filter((seat) => seat.kind === 'AI').length, 1);
});

test('formal timeout makes two humans one team against two AI and freezes all four seats', async () => {
  const storage = new FakeStorage();
  const startedAt = 200_000;
  const first = await create(storage, 8100, 'duo-a', startedAt);
  const second = await create(storage, 8101, 'duo-b', startedAt + 500);
  assert.equal(second.ticket.status, 'WAITING');

  const due = await storedMatchTicketStatus(
    storage,
    { ticketId: first.ticket.ticketId, secret: first.secret },
    statusRuntime(startedAt + MATCH_HUMAN_PRIORITY_MS, 'timeout2-due'),
  );
  assert.equal(due.ticket.status, 'MATCHED');
  assert.equal(due.match.ticketIds.length, 2);
  assert.equal(due.match.aiSeats.length, 2);
  assert.equal(due.match.format, 'TEAM2V2');
  assert.deepEqual(due.match.seats.map((seat) => seat.team), [0, 0, 1, 1]);
  const frozenSeats = structuredClone(due.match.seats);

  const late = await create(storage, 8102, 'late-human', startedAt + MATCH_HUMAN_PRIORITY_MS + 1);
  assert.equal(late.ticket.status, 'WAITING');
  const frozen = await storedMatchTicketStatus(
    storage,
    { ticketId: first.ticket.ticketId, secret: first.secret },
    statusRuntime(startedAt + MATCH_HUMAN_PRIORITY_MS * 2, 'must-not-rewrite'),
  );
  assert.deepEqual(frozen.match.seats, frozenSeats);
  assert.equal(frozen.match.aiSeats.length, 2);
});

test('one human never self-fills; a second arrival after 60s forms the formal 2v2 immediately', async () => {
  const storage = new FakeStorage();
  const startedAt = 300_000;
  const first = await create(storage, 8200, 'solo-waiter', startedAt);
  const stillWaiting = await storedMatchTicketStatus(
    storage,
    { ticketId: first.ticket.ticketId, secret: first.secret },
    statusRuntime(startedAt + MATCH_HUMAN_PRIORITY_MS, 'solo-must-not-start'),
  );
  assert.equal(stillWaiting.ticket.status, 'WAITING');
  assert.equal(stillWaiting.match, null);

  const second = await create(storage, 8201, 'late-partner', startedAt + MATCH_HUMAN_PRIORITY_MS + 10_000);
  assert.equal(second.ticket.status, 'MATCHED');
  assert.equal(second.formedMatchId.length > 0, true);
  const firstAfter = await storedMatchTicketStatus(
    storage,
    { ticketId: first.ticket.ticketId, secret: first.secret },
    statusRuntime(startedAt + MATCH_HUMAN_PRIORITY_MS + 10_001, 'unused'),
  );
  assert.equal(firstAfter.ticket.status, 'MATCHED');
  assert.equal(firstAfter.match.format, 'TEAM2V2');
  assert.equal(firstAfter.match.aiSeats.length, 2);
  assert.deepEqual(firstAfter.match.seats.map((seat) => seat.team), [0, 0, 1, 1]);
});

test('cancel is truthful, removes WAITING indexes, and matched ticket cannot be cancelled', async () => {
  const storage = new FakeStorage();
  const waiting = await create(storage, 1, 'cancel-me');
  const cancelled = await cancelStoredMatchTicket(storage, { ticketId: waiting.ticket.ticketId, secret: waiting.secret });
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.terminal, 'CANCELLED');
  assert.equal((await storage.list({ prefix: MATCH_WAITING_PREFIX })).size, 0);
  const again = await cancelStoredMatchTicket(storage, { ticketId: waiting.ticket.ticketId, secret: waiting.secret });
  assert.equal(again.terminal, 'CANCELLED');

  const matched = [];
  for (let i = 10; i < 14; i += 1) matched.push(await create(storage, i));
  const afterMatch = await cancelStoredMatchTicket(storage, { ticketId: matched[0].ticket.ticketId, secret: matched[0].secret });
  assert.equal(afterMatch.ok, true);
  assert.equal(afterMatch.cancelled, false);
  assert.equal(afterMatch.terminal, 'MATCHED');
});

test('historical cycles never rebuild a monolithic queue value and per-value size stays bounded', async () => {
  const storage = new FakeStorage();
  for (let round = 0; round < 80; round += 1) {
    const base = 1000 + round * 4;
    const batch = [];
    for (let i = 0; i < 4; i += 1) batch.push(await create(storage, base + i));
    assert.equal(batch[3].formedMatchId.length > 0, true);
  }
  for (let round = 0; round < 80; round += 1) {
    const n = 5000 + round;
    const ticket = await create(storage, n, `cancel-${n}`);
    const cancelled = await cancelStoredMatchTicket(storage, { ticketId: ticket.ticket.ticketId, secret: ticket.secret });
    assert.equal(cancelled.terminal, 'CANCELLED');
  }
  assert.equal(storage.map.has('match-queue.v1'), false);
  assert.equal(storage.map.has(MATCH_STORAGE_META_KEY), true);
  assert.equal((await storage.list({ prefix: MATCH_WAITING_PREFIX })).size, 0);
  let maxBytes = 0;
  for (const value of storage.map.values()) maxBytes = Math.max(maxBytes, Buffer.byteLength(JSON.stringify(value)));
  assert.equal(maxBytes < 4096, true, `largest persisted value was ${maxBytes} bytes`);
  assert.equal(storage.listPrefixes.every((prefix) => prefix === MATCH_WAITING_PREFIX), true);
});

test('failed generated-id collision rolls back all writes', async () => {
  const storage = new FakeStorage();
  const firstGenerated = generated();
  const first = await createStoredMatchTicket(storage, { clientId: 'first', idempotencyKey: idem(9000) }, firstGenerated);
  assert.equal(first.ok, true);
  const before = JSON.stringify([...storage.map.entries()].sort(([a], [b]) => a.localeCompare(b)));
  await assert.rejects(
    createStoredMatchTicket(storage, { clientId: 'second', idempotencyKey: idem(9001) }, { ...generated(), ticketId: first.ticket.ticketId }),
    /generated_ticket_id_collision/,
  );
  const after = JSON.stringify([...storage.map.entries()].sort(([a], [b]) => a.localeCompare(b)));
  assert.equal(after, before);
});
