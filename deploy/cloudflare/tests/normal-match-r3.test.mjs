import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
function generated() {
  sequence += 1;
  return {
    ticketId: `t-${String(sequence).padStart(6, '0')}`,
    secret: `0123456789abcdef0123456789abcdef${String(sequence).padStart(8, '0')}`,
    matchId: `m-${String(Math.ceil(sequence / 4)).padStart(6, '0')}`,
  };
}
function idem(n) { return `idem-key-${String(n).padStart(8, '0')}`; }
async function create(storage, n, client = `c-${n}`) {
  return createStoredMatchTicket(storage, { clientId: client, idempotencyKey: idem(n) }, generated());
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

test('four tickets form one atomic match and remove all WAITING index membership', async () => {
  const storage = new FakeStorage();
  const results = [];
  for (let i = 1; i <= 4; i += 1) results.push(await create(storage, i));
  assert.equal(results[3].formedMatchId.startsWith('m-'), true);
  assert.equal((await storage.list({ prefix: MATCH_WAITING_PREFIX })).size, 0);
  for (const result of results) {
    const status = await storedMatchTicketStatus(storage, { ticketId: result.ticket.ticketId, secret: result.secret });
    assert.equal(status.ok, true);
    assert.equal(status.ticket.status, 'MATCHED');
    assert.equal(status.match.ticketIds.length, 4);
  }
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
