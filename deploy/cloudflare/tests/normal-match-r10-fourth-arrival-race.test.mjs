import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MATCH_HUMAN_PRIORITY_MS,
  createStoredMatchTicket,
  storedMatchTicketStatus,
} from '../relay/src/match-store.mjs';

class FakeStorage {
  constructor() { this.map = new Map(); }
  async get(key) {
    if (Array.isArray(key)) {
      const out = new Map();
      for (const item of key) if (this.map.has(item)) out.set(item, structuredClone(this.map.get(item)));
      return out;
    }
    return this.map.has(key) ? structuredClone(this.map.get(key)) : undefined;
  }
  async put(key, value) { this.map.set(key, structuredClone(value)); }
  async delete(key) { return this.map.delete(key); }
  async list({ prefix = '', limit = Number.MAX_SAFE_INTEGER } = {}) {
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

let seq = 0;
function generated(nowMs) {
  seq += 1;
  return {
    ticketId: `t-r10-${String(seq).padStart(6, '0')}`,
    secret: `${String(seq).padStart(64, '0')}`,
    matchId: `m-r10-${String(seq).padStart(6, '0')}`,
    nowMs,
  };
}

async function create(storage, n, nowMs) {
  return createStoredMatchTicket(
    storage,
    { clientId: `r10-human-${n}`, idempotencyKey: `r10-idem-${String(n).padStart(8, '0')}` },
    generated(nowMs),
  );
}

test('expired 3H cohort is frozen as 3H+AI1 before a fourth late Human is admitted', async () => {
  const storage = new FakeStorage();
  const startedAt = 1_000_000;
  const old = [];
  old.push(await create(storage, 1, startedAt));
  old.push(await create(storage, 2, startedAt + 100));
  old.push(await create(storage, 3, startedAt + 200));
  for (const item of old) assert.equal(item.ticket.status, 'WAITING');

  // Simulate a delayed/missed alarm: no status/alarm service occurs before the late fourth create.
  const late = await create(storage, 4, startedAt + MATCH_HUMAN_PRIORITY_MS + 1);

  assert.equal(late.ok, true);
  assert.equal(late.ticket.status, 'WAITING', 'late Human must not rewrite an already-expired 3H cohort');
  assert.equal(late.formedMatchId, '');

  const first = await storedMatchTicketStatus(storage, {
    ticketId: old[0].ticket.ticketId,
    secret: old[0].secret,
  });
  assert.equal(first.ok, true);
  assert.equal(first.ticket.status, 'MATCHED');
  assert.equal(first.match.fillReason, 'HUMAN_PRIORITY_TIMEOUT');
  assert.equal(first.match.ticketIds.length, 3);
  assert.equal(first.match.aiSeats.length, 1);
  assert.equal(first.match.seats.filter((seat) => seat.kind === 'HUMAN').length, 3);
  assert.equal(first.match.seats.filter((seat) => seat.kind === 'AI').length, 1);
});
