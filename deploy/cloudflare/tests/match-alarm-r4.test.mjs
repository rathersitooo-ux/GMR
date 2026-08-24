import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MATCH_HUMAN_PRIORITY_MS,
  createStoredMatchTicket,
  storedMatchTicketStatus,
  cancelStoredMatchTicket,
} from '../relay/src/match-store.mjs';

class FakeStorage {
  constructor() { this.map = new Map(); }
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
function generated(nowMs) {
  sequence += 1;
  return {
    ticketId: `ta-${String(sequence).padStart(6, '0')}`,
    secret: `abcdef0123456789abcdef0123456789${String(sequence).padStart(8, '0')}`,
    matchId: `ma-${String(sequence).padStart(6, '0')}`,
    nowMs,
  };
}
async function create(storage, n, clientId, nowMs) {
  return createStoredMatchTicket(
    storage,
    { clientId, idempotencyKey: `alarm-idem-${String(n).padStart(8, '0')}` },
    generated(nowMs),
  );
}

async function service(storage, runtime) {
  const mod = await import('../relay/src/match-store.mjs');
  assert.equal(
    typeof mod.serviceStoredMatchTimeout,
    'function',
    'server-owned timeout service must exist so 60s fill does not depend on create/status polling',
  );
  return mod.serviceStoredMatchTimeout(storage, runtime);
}

test('server-owned timer forms 3H+AI1 at the exact 60s boundary without a status/create request', async () => {
  const storage = new FakeStorage();
  const startedAt = 100_000;
  const humans = [];
  for (let i = 0; i < 3; i += 1) humans.push(await create(storage, 100 + i, `alarm3-${i}`, startedAt + i * 100));

  const before = await service(storage, {
    nowMs: startedAt + MATCH_HUMAN_PRIORITY_MS - 1,
    generatedMatchId: 'm-alarm3-before',
  });
  assert.equal(before.ok, true);
  assert.equal(before.formedMatchId, '');
  assert.equal(before.nextAlarmAt, startedAt + MATCH_HUMAN_PRIORITY_MS);

  const due = await service(storage, {
    nowMs: startedAt + MATCH_HUMAN_PRIORITY_MS,
    generatedMatchId: 'm-alarm3-due',
  });
  assert.equal(due.ok, true);
  assert.equal(due.formedMatchId, 'm-alarm3-due');
  assert.equal(due.match.format, 'FREE4P');
  assert.equal(due.match.aiSeats.length, 1);
  assert.equal(due.match.seats.filter((seat) => seat.kind === 'HUMAN').length, 3);
  assert.equal(due.nextAlarmAt, null);

  const persisted = await storedMatchTicketStatus(storage, {
    ticketId: humans[0].ticket.ticketId,
    secret: humans[0].secret,
  });
  assert.equal(persisted.ticket.status, 'MATCHED');
  assert.equal(persisted.match.matchId, 'm-alarm3-due');

  const retry = await service(storage, {
    nowMs: startedAt + MATCH_HUMAN_PRIORITY_MS + 1,
    generatedMatchId: 'm-alarm3-retry',
  });
  assert.equal(retry.ok, true);
  assert.equal(retry.formedMatchId, '');
  assert.equal(retry.nextAlarmAt, null);
  const afterRetry = await storedMatchTicketStatus(storage, {
    ticketId: humans[0].ticket.ticketId,
    secret: humans[0].secret,
  });
  assert.deepEqual(afterRetry.match.seats, persisted.match.seats);
});

test('server-owned timer forms 2H same-team vs AI2 and never rewrites frozen seats on retry', async () => {
  const storage = new FakeStorage();
  const startedAt = 200_000;
  const first = await create(storage, 200, 'alarm2-a', startedAt);
  await create(storage, 201, 'alarm2-b', startedAt + 500);

  const due = await service(storage, {
    nowMs: startedAt + MATCH_HUMAN_PRIORITY_MS,
    generatedMatchId: 'm-alarm2-due',
  });
  assert.equal(due.formedMatchId, 'm-alarm2-due');
  assert.equal(due.match.format, 'TEAM2V2');
  assert.equal(due.match.aiSeats.length, 2);
  assert.deepEqual(due.match.seats.map((seat) => seat.team), [0, 0, 1, 1]);
  const frozen = structuredClone(due.match.seats);

  await service(storage, {
    nowMs: startedAt + MATCH_HUMAN_PRIORITY_MS + 5_000,
    generatedMatchId: 'm-alarm2-retry',
  });
  const persisted = await storedMatchTicketStatus(storage, {
    ticketId: first.ticket.ticketId,
    secret: first.secret,
  });
  assert.deepEqual(persisted.match.seats, frozen);
});

test('server-owned timer leaves a solo human waiting and does not keep a useless alarm alive', async () => {
  const storage = new FakeStorage();
  const startedAt = 300_000;
  const solo = await create(storage, 300, 'alarm-solo', startedAt);
  const result = await service(storage, {
    nowMs: startedAt + MATCH_HUMAN_PRIORITY_MS * 3,
    generatedMatchId: 'm-alarm-solo-must-not-form',
  });
  assert.equal(result.ok, true);
  assert.equal(result.formedMatchId, '');
  assert.equal(result.nextAlarmAt, null);
  const status = await storedMatchTicketStatus(storage, {
    ticketId: solo.ticket.ticketId,
    secret: solo.secret,
  });
  assert.equal(status.ticket.status, 'WAITING');
  assert.equal(status.match, null);
});

test('cancel before the boundary prevents alarm resurrection', async () => {
  const storage = new FakeStorage();
  const startedAt = 400_000;
  const first = await create(storage, 400, 'alarm-cancel-a', startedAt);
  const second = await create(storage, 401, 'alarm-cancel-b', startedAt + 100);
  const cancelled = await cancelStoredMatchTicket(storage, {
    ticketId: second.ticket.ticketId,
    secret: second.secret,
  });
  assert.equal(cancelled.terminal, 'CANCELLED');

  const result = await service(storage, {
    nowMs: startedAt + MATCH_HUMAN_PRIORITY_MS,
    generatedMatchId: 'm-alarm-cancel-must-not-form',
  });
  assert.equal(result.formedMatchId, '');
  assert.equal(result.nextAlarmAt, null);
  const status = await storedMatchTicketStatus(storage, {
    ticketId: first.ticket.ticketId,
    secret: first.secret,
  });
  assert.equal(status.ticket.status, 'WAITING');
});
