import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

async function serviceTimeout(storage, runtime) {
  const mod = await import('../relay/src/match-store.mjs');
  assert.equal(
    typeof mod.serviceStoredMatchTimeout,
    'function',
    'server-owned timeout service must exist so 60s fill does not depend on create/status polling',
  );
  return mod.serviceStoredMatchTimeout(storage, runtime);
}

async function createThroughProductionGate(storage, n, client, nowMs) {
  const ids = generated(nowMs);
  const preCreateTimeout = await serviceTimeout(storage, { nowMs, generatedMatchId: ids.matchId });
  if (!preCreateTimeout.ok) return preCreateTimeout;
  return createStoredMatchTicket(storage, { clientId: client, idempotencyKey: idem(n) }, ids);
}

test('production create gate freezes an expired 3H cohort before a late fourth Human is admitted', async () => {
  const workerSource = await readFile(new URL('../relay/src/relay-worker.mjs', import.meta.url), 'utf8');
  const gateIndex = workerSource.indexOf('const preCreateTimeout = await serviceStoredMatchTimeout(ctx.storage');
  const createIndex = workerSource.indexOf('const result = await createStoredMatchTicket(ctx.storage, body, generated);');
  assert.equal(gateIndex >= 0, true, 'production create path must service timeout before admitting a new Human');
  assert.equal(createIndex > gateIndex, true, 'production create path must admit only after timeout service');

  const storage = new FakeStorage();
  const startedAt = 450_000;
  const old = [];
  old.push(await create(storage, 9500, 'race-old-1', startedAt));
  old.push(await create(storage, 9501, 'race-old-2', startedAt + 100));
  old.push(await create(storage, 9502, 'race-old-3', startedAt + 200));
  for (const item of old) assert.equal(item.ticket.status, 'WAITING');

  const late = await createThroughProductionGate(
    storage,
    9503,
    'race-late-4',
    startedAt + MATCH_HUMAN_PRIORITY_MS + 1,
  );
  assert.equal(late.ok, true);
  assert.equal(late.ticket.status, 'WAITING');
  assert.equal(late.formedMatchId, '');

  const frozen = await storedMatchTicketStatus(storage, {
    ticketId: old[0].ticket.ticketId,
    secret: old[0].secret,
  });
  assert.equal(frozen.ticket.status, 'MATCHED');
  assert.equal(frozen.match.fillReason, 'HUMAN_PRIORITY_TIMEOUT');
  assert.equal(frozen.match.ticketIds.length, 3);
  assert.equal(frozen.match.aiSeats.length, 1);
  assert.equal(frozen.match.seats.filter((seat) => seat.kind === 'HUMAN').length, 3);

  const soloStorage = new FakeStorage();
  const solo = await create(soloStorage, 9510, 'race-solo', 460_000);
  const lateSecond = await createThroughProductionGate(
    soloStorage,
    9511,
    'race-late-second',
    460_000 + MATCH_HUMAN_PRIORITY_MS + 1,
  );
  assert.equal(lateSecond.ticket.status, 'MATCHED');
  const soloAfter = await storedMatchTicketStatus(soloStorage, {
    ticketId: solo.ticket.ticketId,
    secret: solo.secret,
  });
  assert.equal(soloAfter.match.format, 'TEAM2V2');
  assert.equal(soloAfter.match.aiSeats.length, 2);
});

test('server-owned timeout forms 3H+AI1 at 60s without any foreground create/status request', async () => {
  const storage = new FakeStorage();
  const startedAt = 500_000;
  const humans = [];
  for (let i = 0; i < 3; i += 1) humans.push(await create(storage, 9100 + i, `alarm3-${i}`, startedAt + i * 100));

  const before = await serviceTimeout(storage, {
    nowMs: startedAt + MATCH_HUMAN_PRIORITY_MS - 1,
    generatedMatchId: 'm-alarm3-before',
  });
  assert.equal(before.ok, true);
  assert.equal(before.formedMatchId, '');
  assert.equal(before.nextAlarmAt, startedAt + MATCH_HUMAN_PRIORITY_MS);

  const due = await serviceTimeout(storage, {
    nowMs: startedAt + MATCH_HUMAN_PRIORITY_MS,
    generatedMatchId: 'm-alarm3-due',
  });
  assert.equal(due.ok, true);
  assert.equal(due.formedMatchId, 'm-alarm3-due');
  assert.equal(due.match.format, 'FREE4P');
  assert.equal(due.match.aiSeats.length, 1);
  assert.equal(due.nextAlarmAt, null);

  const persisted = await storedMatchTicketStatus(storage, {
    ticketId: humans[0].ticket.ticketId,
    secret: humans[0].secret,
  });
  assert.equal(persisted.ticket.status, 'MATCHED');
  const frozen = structuredClone(persisted.match.seats);

  const retry = await serviceTimeout(storage, {
    nowMs: startedAt + MATCH_HUMAN_PRIORITY_MS + 1,
    generatedMatchId: 'm-alarm3-retry',
  });
  assert.equal(retry.formedMatchId, '');
  assert.equal(retry.nextAlarmAt, null);
  const afterRetry = await storedMatchTicketStatus(storage, {
    ticketId: humans[0].ticket.ticketId,
    secret: humans[0].secret,
  });
  assert.deepEqual(afterRetry.match.seats, frozen);
});

test('server-owned timeout forms 2H same-team vs AI2 and solo/cancel cannot be resurrected', async () => {
  const storage = new FakeStorage();
  const startedAt = 600_000;
  const first = await create(storage, 9200, 'alarm2-a', startedAt);
  await create(storage, 9201, 'alarm2-b', startedAt + 500);
  const due = await serviceTimeout(storage, {
    nowMs: startedAt + MATCH_HUMAN_PRIORITY_MS,
    generatedMatchId: 'm-alarm2-due',
  });
  assert.equal(due.match.format, 'TEAM2V2');
  assert.equal(due.match.aiSeats.length, 2);
  assert.deepEqual(due.match.seats.map((seat) => seat.team), [0, 0, 1, 1]);
  const firstStatus = await storedMatchTicketStatus(storage, { ticketId: first.ticket.ticketId, secret: first.secret });
  assert.equal(firstStatus.ticket.status, 'MATCHED');

  const soloStorage = new FakeStorage();
  const solo = await create(soloStorage, 9300, 'alarm-solo', 700_000);
  const soloService = await serviceTimeout(soloStorage, {
    nowMs: 700_000 + MATCH_HUMAN_PRIORITY_MS * 3,
    generatedMatchId: 'm-alarm-solo-must-not-form',
  });
  assert.equal(soloService.formedMatchId, '');
  assert.equal(soloService.nextAlarmAt, null);
  const soloStatus = await storedMatchTicketStatus(soloStorage, { ticketId: solo.ticket.ticketId, secret: solo.secret });
  assert.equal(soloStatus.ticket.status, 'WAITING');

  const cancelStorage = new FakeStorage();
  const cancelA = await create(cancelStorage, 9400, 'alarm-cancel-a', 800_000);
  const cancelB = await create(cancelStorage, 9401, 'alarm-cancel-b', 800_100);
  await cancelStoredMatchTicket(cancelStorage, { ticketId: cancelB.ticket.ticketId, secret: cancelB.secret });
  const cancelService = await serviceTimeout(cancelStorage, {
    nowMs: 800_000 + MATCH_HUMAN_PRIORITY_MS,
    generatedMatchId: 'm-alarm-cancel-must-not-form',
  });
  assert.equal(cancelService.formedMatchId, '');
  assert.equal(cancelService.nextAlarmAt, null);
  const cancelAStatus = await storedMatchTicketStatus(cancelStorage, { ticketId: cancelA.ticket.ticketId, secret: cancelA.secret });
  assert.equal(cancelAStatus.ticket.status, 'WAITING');
});

const liveAlarmUrl = String(process.env.GAMEROAD_NORMAL_MATCH_URL || '').trim();

test('public normal-match alarm advances 2H/3H after a zero-request window while 1H never self-fills', {
  skip: !liveAlarmUrl,
  timeout: 180_000,
}, async () => {
  const expectedBuildSha = String(process.env.GAMEROAD_EXPECTED_BUILD_SHA || '').trim();
  const waitMs = Number(process.env.GAMEROAD_ALARM_PROBE_WAIT_MS || 125_000);
  const rawRunKey = String(process.env.GAMEROAD_ALARM_PROBE_RUN_KEY || process.env.GITHUB_RUN_ID || Date.now());
  assert.equal(Number.isSafeInteger(waitMs) && waitMs >= 60_000 && waitMs <= 180_000, true);
  if (expectedBuildSha) assert.match(expectedBuildSha, /^[0-9a-f]{40}$/i);

  const base = new URL(liveAlarmUrl);
  assert.equal(base.protocol, 'https:');
  const runKey = rawRunKey.replace(/[^A-Za-z0-9._:-]/g, '-').slice(0, 48) || 'manual';

  async function verifyBuild(phase) {
    const response = await fetch(new URL('/gameroad-version.json', base.origin), {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      redirect: 'follow',
    });
    assert.equal(response.status, 200, `${phase}: version manifest HTTP`);
    assert.match(String(response.headers.get('cache-control') || ''), /no-store/i);
    const manifest = await response.json();
    const buildId = String(manifest?.build_id || '');
    assert.match(buildId, /^[0-9a-f]{40}$/i);
    if (expectedBuildSha) assert.equal(buildId, expectedBuildSha, `${phase}: deployed SHA`);
    return buildId;
  }

  async function postJson(op, queue, body) {
    const url = new URL(base);
    url.searchParams.set('matchOp', op);
    url.searchParams.set('queue', queue);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      redirect: 'follow',
    });
    assert.equal(response.status, 200, `${op}: HTTP`);
    assert.match(String(response.headers.get('cache-control') || ''), /no-store/i);
    const value = await response.json();
    assert.equal(value?.ok, true, `${op}: ok`);
    return value;
  }

  async function setup(kind, count) {
    const queue = `alarm-${kind}-${runKey}`;
    const humans = [];
    for (let index = 1; index <= count; index += 1) {
      const created = await postJson('create', queue, {
        clientId: `alarm-${kind}-${index}-${runKey}`,
        idempotencyKey: `alarm-idem-${kind}-${index}-${runKey}`,
      });
      assert.equal(created.ticket?.status, 'WAITING');
      assert.equal(created.formedMatchId, '');
      assert.equal(typeof created.ticket?.ticketId, 'string');
      assert.equal(typeof created.secret, 'string');
      humans.push({ ticketId: created.ticket.ticketId, secret: created.secret });
    }
    return { queue, humans };
  }

  const beforeBuildId = await verifyBuild('before');
  const [solo, duo, trio] = await Promise.all([
    setup('solo', 1),
    setup('duo', 2),
    setup('trio', 3),
  ]);

  console.log(`Prepared isolated 1H/2H/3H queues; entering ${waitMs}ms zero-request window.`);
  await new Promise((resolve) => setTimeout(resolve, waitMs));

  // cancel is deliberately the first post-wait queue request: unlike status,
  // it does not service the timeout, so MATCHED here proves background progress.
  const [duoCancel, trioCancel, soloCancel] = await Promise.all([
    postJson('cancel', duo.queue, duo.humans[0]),
    postJson('cancel', trio.queue, trio.humans[0]),
    postJson('cancel', solo.queue, solo.humans[0]),
  ]);
  for (const [label, value] of [['2H', duoCancel], ['3H', trioCancel]]) {
    assert.equal(value.cancelled, false, `${label}: first cancel must see MATCHED`);
    assert.equal(value.terminal, 'MATCHED');
    assert.equal(value.ticket?.status, 'MATCHED');
  }
  assert.equal(soloCancel.cancelled, true);
  assert.equal(soloCancel.terminal, 'CANCELLED');
  assert.equal(soloCancel.ticket?.status, 'CANCELLED');

  async function statusGroup(group, format, aiSeatCount) {
    const statuses = await Promise.all(group.humans.map((human) => postJson('status', group.queue, human)));
    const sessionIds = new Set();
    const slots = new Set();
    for (const value of statuses) {
      assert.equal(value.ticket?.status, 'MATCHED');
      assert.equal(value.session?.size, 4);
      assert.equal(value.session?.format, format);
      assert.equal(value.session?.aiSeatCount, aiSeatCount);
      assert.equal(typeof value.session?.sessionId, 'string');
      assert.equal(Number.isInteger(value.session?.slot), true);
      sessionIds.add(value.session.sessionId);
      slots.add(value.session.slot);
    }
    assert.equal(sessionIds.size, 1);
    assert.equal(slots.size, group.humans.length);
  }

  await statusGroup(duo, 'TEAM2V2', 2);
  await statusGroup(trio, 'FREE4P', 1);
  const afterBuildId = await verifyBuild('after');
  assert.equal(afterBuildId, beforeBuildId, 'public build changed during zero-request verification');
  console.log('Public normal-match alarm probe passed: stable build, zero-request wakeup, 2H+AI2, 3H+AI1, solo no-self-fill.');
});
