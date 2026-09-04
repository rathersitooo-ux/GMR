import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BATTLE_EVENT_RECEIPT_AUTHORITY,
  BATTLE_EVENT_RECORD_PREFIX,
  BATTLE_EVENT_SOURCE_SCHEMA,
  handleBattleEventRequest,
  readStoredBattleEvent,
  submitStoredBattleEvent,
} from '../relay/src/battle-event-store.mjs';
import { onRequest as battleEventRoute } from '../functions/battle-event.js';

class FakeStorage {
  constructor() { this.map = new Map(); }
  async get(key) { return this.map.has(key) ? structuredClone(this.map.get(key)) : undefined; }
  async put(key, value) { this.map.set(key, structuredClone(value)); }
  async delete(key) { return this.map.delete(key); }
  async list({ prefix = '', limit = Number.MAX_SAFE_INTEGER } = {}) {
    return new Map([...this.map.entries()].filter(([key]) => key.startsWith(prefix)).slice(0, limit));
  }
  async transaction(fn) {
    const before = structuredClone([...this.map.entries()]);
    try { return await fn(this); }
    catch (error) { this.map = new Map(before); throw error; }
  }
}

const TICKET_ID = 't-reporter';
const SECRET = 's'.repeat(32);
const MATCH_ID = 'm-battle-001';
const VERSIONS = Object.freeze({ rules: 'rules-1', content: 'content-2', state: 'state-3' });

function seedMatchedStorage() {
  const storage = new FakeStorage();
  storage.map.set(`match/ticket/${TICKET_ID}`, {
    clientId: 'client-reporter',
    secret: SECRET,
    status: 'MATCHED',
    sequence: 1,
    matchId: MATCH_ID,
  });
  storage.map.set(`match/record/${MATCH_ID}`, {
    matchId: MATCH_ID,
    ticketIds: [TICKET_ID],
    aiSeats: [1, 2, 3],
    seats: [
      { slot: 0, kind: 'HUMAN', ticketId: TICKET_ID, clientId: 'client-reporter', team: 0 },
      { slot: 1, kind: 'AI', aiId: 'AI1', team: 1 },
      { slot: 2, kind: 'AI', aiId: 'AI2', team: 0 },
      { slot: 3, kind: 'AI', aiId: 'AI3', team: 1 },
    ],
    format: 'FREE4P',
    fillReason: 'TEST',
    startedAtMs: 10,
  });
  return storage;
}

function resolution(overrides = {}) {
  const base = {
    ticketId: TICKET_ID,
    secret: SECRET,
    sourceSchema: BATTLE_EVENT_SOURCE_SCHEMA,
    matchId: MATCH_ID,
    sequence: 1,
    kind: 'battle_resolution',
    versions: { ...VERSIONS },
    publicData: {
      serial: 1,
      round: 1,
      mode: '4p',
      attackerId: 'p1',
      defenderId: 'p2',
      lane: 'lane-1',
      shield: null,
      winnerIds: [],
      winningTeam: null,
      teamTotals: null,
      players: [
        { id: 'p1', name: 'DO_NOT_STORE_NAME', team: 'A', score: 7, winner: true, cards: [
          { cardId: 'C-001', label: 'DO_NOT_STORE_LABEL', value: 7, origin: 'battle' },
        ] },
        { id: 'p2', name: 'DO_NOT_STORE_NAME_2', team: 'B', score: 4, winner: false, cards: [
          { cardId: 'C-002', label: 'DO_NOT_STORE_LABEL_2', value: 4, origin: 'road' },
        ] },
      ],
      laneGains: [
        { id: 'p1', lane: 'lane-1', before: 2, after: 3, added: 1 },
        { id: 'p2', lane: 'lane-1', before: 1, after: 1, added: 0 },
      ],
      maxLaneProgress: [
        { id: 'p1', before: 2, after: 3 },
        { id: 'p2', before: 1, after: 1 },
      ],
    },
    privateData: { hand: ['SECRET_CARD'] },
    authorityOnly: { serverSecret: 'DO_NOT_STORE' },
  };
  return { ...base, ...overrides };
}

function ended(overrides = {}) {
  return {
    ticketId: TICKET_ID,
    secret: SECRET,
    sourceSchema: BATTLE_EVENT_SOURCE_SCHEMA,
    matchId: MATCH_ID,
    sequence: 2,
    kind: 'match_ended',
    versions: { ...VERSIONS },
    publicData: {
      winnerIds: ['p1'],
      round: 1,
      mode: '4p',
      formalRanking: [
        { id: 'p1', rank: 1, maxColumn: 7 },
        { id: 'p2', rank: 2, maxColumn: 5 },
        { id: 'p3', rank: 3, maxColumn: 4 },
        { id: 'p4', rank: 4, maxColumn: 3 },
      ],
    },
    ...overrides,
  };
}

function assertReceipt(result, sequence, kind, idempotent = false) {
  assert.equal(result.ok, true);
  assert.equal(result.idempotent, idempotent);
  assert.equal(result.matchId, MATCH_ID);
  assert.equal(result.sequence, sequence);
  assert.equal(result.kind, kind);
  assert.deepEqual(result.versions, VERSIONS);
  assert.equal(result.reporterSlot, 0);
  assert.deepEqual(result.receiptAuthority, {
    verified: true,
    authorityId: BATTLE_EVENT_RECEIPT_AUTHORITY,
    scope: 'authenticated_match_participant_receipt',
    gameplayAuthoritative: false,
  });
}

test('matched participant can append a sanitized ordered public replay event receipt', async () => {
  const storage = seedMatchedStorage();
  const result = await submitStoredBattleEvent(storage, resolution(), { nowMs: 100 });
  assertReceipt(result, 1, 'battle_resolution');

  const read = await readStoredBattleEvent(storage, { matchId: MATCH_ID, sequence: 1 });
  assert.equal(read.ok, true);
  assert.equal(read.record.publicData.players[0].id, 'p1');
  assert.deepEqual(read.record.publicData.players[0].cards, [{ cardId: 'C-001', value: 7 }]);
  assert.equal(read.record.receivedAtMs, 100);
  assert.equal(read.record.receiptAuthority.gameplayAuthoritative, false);

  const serialized = JSON.stringify([...storage.map.entries()]);
  for (const forbidden of ['DO_NOT_STORE_NAME', 'DO_NOT_STORE_LABEL', 'SECRET_CARD', 'serverSecret', 'authorityOnly', 'privateData']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.equal([...storage.map.keys()].some((key) => key.startsWith(BATTLE_EVENT_RECORD_PREFIX)), true);
});

test('exact same sequence is idempotent while changed payload at the same sequence conflicts', async () => {
  const storage = seedMatchedStorage();
  const first = await submitStoredBattleEvent(storage, resolution());
  const duplicate = await submitStoredBattleEvent(storage, resolution());
  assertReceipt(first, 1, 'battle_resolution');
  assertReceipt(duplicate, 1, 'battle_resolution', true);

  const changed = resolution({
    publicData: { ...resolution().publicData, round: 2 },
  });
  assert.deepEqual(await submitStoredBattleEvent(storage, changed), {
    ok: false,
    reason: 'battle_event_sequence_conflict',
  });
});

test('gap, version drift, and events after terminal match_ended fail closed', async () => {
  const gapStorage = seedMatchedStorage();
  assert.deepEqual(await submitStoredBattleEvent(gapStorage, ended()), {
    ok: false,
    reason: 'battle_event_sequence_gap',
  });

  const storage = seedMatchedStorage();
  await submitStoredBattleEvent(storage, resolution());
  const drift = ended({ versions: { ...VERSIONS, content: 'content-NEW' } });
  assert.deepEqual(await submitStoredBattleEvent(storage, drift), {
    ok: false,
    reason: 'battle_event_version_conflict',
  });

  assertReceipt(await submitStoredBattleEvent(storage, ended()), 2, 'match_ended');
  const afterEnd = resolution({ sequence: 3, publicData: { ...resolution().publicData, serial: 2, round: 2 } });
  assert.deepEqual(await submitStoredBattleEvent(storage, afterEnd), {
    ok: false,
    reason: 'battle_event_terminal',
  });
});

test('wrong secret and wrong match never gain a receipt', async () => {
  const storage = seedMatchedStorage();
  assert.deepEqual(await submitStoredBattleEvent(storage, resolution({ secret: 'x'.repeat(32) })), {
    ok: false,
    reason: 'battle_event_auth_invalid',
  });
  assert.deepEqual(await submitStoredBattleEvent(storage, resolution({ matchId: 'm-other' })), {
    ok: false,
    reason: 'battle_event_match_invalid',
  });
});

test('unsupported source, malformed public payload, and oversized request fail closed', async () => {
  const storage = seedMatchedStorage();
  assert.deepEqual(await submitStoredBattleEvent(storage, resolution({ sourceSchema: 'OTHER' })), {
    ok: false,
    reason: 'battle_event_request_invalid',
  });
  const malformed = resolution({ publicData: { ...resolution().publicData, players: [{ id: 'p1', score: 'NaN', cards: [] }] } });
  assert.deepEqual(await submitStoredBattleEvent(storage, malformed), {
    ok: false,
    reason: 'battle_event_request_invalid',
  });

  const req = new Request('https://example.test/battle-event?battleEventOp=submit', {
    method: 'POST', headers: { 'content-length': '20000' }, body: '{}',
  });
  const res = await handleBattleEventRequest(storage, req, new URL(req.url));
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { ok: false, reason: 'battle_event_request_invalid' });
});

test('HTTP provider returns a bounded participant-authenticated receipt, not gameplay authority', async () => {
  const storage = seedMatchedStorage();
  const req = new Request('https://example.test/battle-event?battleEventOp=submit', {
    method: 'POST', body: JSON.stringify(resolution()),
  });
  const res = await handleBattleEventRequest(storage, req, new URL(req.url), { nowMs: 222 });
  assert.equal(res.status, 200);
  const body = await res.json();
  assertReceipt(body, 1, 'battle_resolution');
  assert.equal(body.receiptAuthority.gameplayAuthoritative, false);
});

test('Pages /battle-event route targets the exact same queue-scoped Durable Object as normal matchmaking', async () => {
  const seen = { names: [], requests: [] };
  const response = await battleEventRoute({
    request: new Request('https://example.test/battle-event?battleEventOp=submit&queue=normal-main', {
      method: 'POST', body: '{}',
    }),
    env: {
      GAMEROAD_ROOMS: {
        idFromName(name) { seen.names.push(name); return `id:${name}`; },
        get(id) {
          return { fetch(request) { seen.requests.push({ id, url: request.url }); return new Response('forwarded'); } };
        },
      },
    },
  });
  assert.equal(await response.text(), 'forwarded');
  assert.deepEqual(seen.names, ['gameroad.normal.normal-main']);
  assert.equal(seen.requests[0].url.includes('battleEventOp=submit'), true);

  const invalid = await battleEventRoute({
    request: new Request('https://example.test/battle-event?battleEventOp=submit&queue=x', { method: 'POST' }),
    env: {},
  });
  assert.equal(invalid.status, 400);
});

test('production relay mounts battleEventOp between existing report and match non-WebSocket gates', async () => {
  const source = await readFile(new URL('../relay/src/relay-worker.mjs', import.meta.url), 'utf8');
  assert.match(source, /import \{ handleBattleEventRequest \} from '\.\/battle-event-store\.mjs';/);
  const reportIndex = source.indexOf("if (url.searchParams.has('reportOp')) return handlePartnerReportRequest(this.ctx.storage, request, url);");
  const battleIndex = source.indexOf("if (url.searchParams.has('battleEventOp')) return handleBattleEventRequest(this.ctx.storage, request, url);");
  const matchIndex = source.indexOf("if (url.searchParams.has('matchOp')) return handleMatchRequest(this.ctx, request, url);");
  const fallbackIndex = source.indexOf("return new Response('WebSocket upgrade required'");
  assert.equal(reportIndex >= 0, true);
  assert.equal(battleIndex > reportIndex, true);
  assert.equal(matchIndex > battleIndex, true);
  assert.equal(fallbackIndex > matchIndex, true);
});
