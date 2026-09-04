import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BATTLE_RECEIPT_AUTHORITY_ID,
  BATTLE_RECEIPT_RECORD_PREFIX,
  BATTLE_RECEIPT_SOURCE_SCHEMA,
  PARTNER_REPORT_AUTHORITY_ID,
  PARTNER_REPORT_CANONICAL_PREFIX,
  PARTNER_REPORT_IDEMPOTENCY_PREFIX,
  PARTNER_REPORT_RECORD_PREFIX,
  handleBattleReceiptRequest,
  handlePartnerReportRequest,
  readStoredBattleReceipt,
  readStoredPartnerReport,
  submitStoredBattleReceipt,
  submitStoredPartnerReport,
} from '../relay/src/partner-report-store.mjs';
import { onRequest as reportRoute } from '../functions/report.js';

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

function submission(overrides = {}) {
  return {
    idempotencyKey: 'idem-report-0001',
    partnerId: 'partner.naki',
    reportType: 'bug',
    sourceUseSite: 'partner_report',
    sourceStateIdentity: 'report-state-9',
    versions: { rules: 'rules-1', content: 'content-2', state: 'state-3' },
    ...overrides,
  };
}

function expectedRead(reportId, disposition = 'accepted_unique') {
  return {
    ok: true,
    status: 'ready',
    reportId,
    reportType: 'bug',
    disposition,
    partnerId: 'partner.naki',
    sourceUseSite: 'partner_report',
    sourceStateIdentity: 'report-state-9',
    versions: { rules: 'rules-1', content: 'content-2', state: 'state-3' },
    authority: { verified: true, authorityId: PARTNER_REPORT_AUTHORITY_ID },
  };
}

test('first canonical submission is authoritative accepted_unique and direct read preserves the consumer contract', async () => {
  const storage = new FakeStorage();
  const submitted = await submitStoredPartnerReport(storage, submission(), { reportId: 'r-first', nowMs: 100 });
  assert.deepEqual(submitted, { ok: true, idempotent: false, report: expectedRead('r-first') });
  const read = await readStoredPartnerReport(storage, { reportId: 'r-first' });
  assert.deepEqual(read, { ok: true, report: expectedRead('r-first') });
});

test('same idempotency key and identity replays exactly the same report', async () => {
  const storage = new FakeStorage();
  const first = await submitStoredPartnerReport(storage, submission(), { reportId: 'r-first' });
  const replay = await submitStoredPartnerReport(storage, submission(), { reportId: 'r-unused' });
  assert.equal(first.report.reportId, 'r-first');
  assert.deepEqual(replay, { ok: true, idempotent: true, report: expectedRead('r-first') });
});

test('same idempotency key with changed canonical identity is a conflict', async () => {
  const storage = new FakeStorage();
  await submitStoredPartnerReport(storage, submission(), { reportId: 'r-first' });
  const conflict = await submitStoredPartnerReport(storage, submission({ reportType: 'request' }), { reportId: 'r-second' });
  assert.deepEqual(conflict, { ok: false, reason: 'report_idempotency_conflict' });
});

test('same canonical report with a new idempotency key gets a distinct duplicate reportId', async () => {
  const storage = new FakeStorage();
  const first = await submitStoredPartnerReport(storage, submission(), { reportId: 'r-first' });
  const duplicate = await submitStoredPartnerReport(storage, submission({ idempotencyKey: 'idem-report-0002' }), { reportId: 'r-duplicate' });
  assert.equal(first.report.disposition, 'accepted_unique');
  assert.equal(duplicate.report.reportId, 'r-duplicate');
  assert.equal(duplicate.report.disposition, 'duplicate');
  assert.notEqual(duplicate.report.reportId, first.report.reportId);
  assert.deepEqual((await readStoredPartnerReport(storage, { reportId: 'r-duplicate' })).report, expectedRead('r-duplicate', 'duplicate'));
});

test('a different canonical identity is accepted_unique again', async () => {
  const storage = new FakeStorage();
  await submitStoredPartnerReport(storage, submission(), { reportId: 'r-first' });
  const second = await submitStoredPartnerReport(storage, submission({
    idempotencyKey: 'idem-report-0002',
    sourceStateIdentity: 'report-state-10',
  }), { reportId: 'r-second' });
  assert.equal(second.report.disposition, 'accepted_unique');
});

test('Good/Bad and malformed identity/version input are rejected rather than granted report authority', async () => {
  const storage = new FakeStorage();
  for (const reportType of ['good', 'bad', 'praise']) {
    assert.deepEqual(await submitStoredPartnerReport(storage, submission({ reportType }), { reportId: `r-${reportType}` }), {
      ok: false,
      reason: 'report_request_invalid',
    });
  }
  assert.equal((await submitStoredPartnerReport(storage, submission({ partnerId: '' }), { reportId: 'r-x' })).ok, false);
  assert.equal((await submitStoredPartnerReport(storage, submission({ versions: { rules: 'r', content: '', state: 's' } }), { reportId: 'r-y' })).ok, false);
});

test('unknown report read is explicit not_found', async () => {
  const storage = new FakeStorage();
  assert.deepEqual(await readStoredPartnerReport(storage, { reportId: 'r-missing' }), { ok: false, reason: 'report_not_found' });
});

test('raw report text and client authority/disposition are never persisted or projected', async () => {
  const storage = new FakeStorage();
  const injected = submission({
    rawReportText: 'do not persist me',
    disposition: 'accepted_unique',
    authority: { verified: true, authorityId: 'client-forged' },
    reward: { coins: 999 },
    affinityDelta: 999,
  });
  const result = await submitStoredPartnerReport(storage, injected, { reportId: 'r-clean', nowMs: 123 });
  assert.equal(result.report.authority.authorityId, PARTNER_REPORT_AUTHORITY_ID);
  assert.equal(result.report.disposition, 'accepted_unique');
  const serialized = JSON.stringify([...storage.map.entries()]);
  assert.equal(serialized.includes('do not persist me'), false);
  assert.equal(serialized.includes('client-forged'), false);
  assert.equal(serialized.includes('coins'), false);
  assert.equal(serialized.includes('affinityDelta'), false);
  assert.equal([...storage.map.keys()].some((key) => key.startsWith(PARTNER_REPORT_RECORD_PREFIX)), true);
  assert.equal([...storage.map.keys()].some((key) => key.startsWith(PARTNER_REPORT_IDEMPOTENCY_PREFIX)), true);
  assert.equal([...storage.map.keys()].some((key) => key.startsWith(PARTNER_REPORT_CANONICAL_PREFIX)), true);
});

test('HTTP provider returns direct authoritative read, conflict, not_found, and bounded request errors', async () => {
  const storage = new FakeStorage();
  const submitReq = new Request('https://example.test/report?reportOp=submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(submission()),
  });
  const submitRes = await handlePartnerReportRequest(storage, submitReq, new URL(submitReq.url), { reportId: 'r-http' });
  assert.equal(submitRes.status, 200);
  assert.deepEqual(await submitRes.json(), { ...expectedRead('r-http'), idempotent: false });

  const conflictReq = new Request('https://example.test/report?reportOp=submit', {
    method: 'POST', body: JSON.stringify(submission({ reportType: 'request' })),
  });
  const conflictRes = await handlePartnerReportRequest(storage, conflictReq, new URL(conflictReq.url), { reportId: 'r-conflict' });
  assert.equal(conflictRes.status, 409);

  const missingReq = new Request('https://example.test/report?reportOp=read', {
    method: 'POST', body: JSON.stringify({ reportId: 'r-missing' }),
  });
  const missingRes = await handlePartnerReportRequest(storage, missingReq, new URL(missingReq.url));
  assert.equal(missingRes.status, 404);

  const largeReq = new Request('https://example.test/report?reportOp=submit', {
    method: 'POST', headers: { 'content-length': '5000' }, body: '{}',
  });
  const largeRes = await handlePartnerReportRequest(storage, largeReq, new URL(largeReq.url));
  assert.equal(largeRes.status, 413);
});

test('Pages /report route forwards to one deterministic existing Durable Object binding', async () => {
  const seen = { names: [], requests: [] };
  const response = await reportRoute({
    request: new Request('https://example.test/report?reportOp=read', { method: 'POST', body: '{}' }),
    env: {
      GAMEROAD_ROOMS: {
        idFromName(name) { seen.names.push(name); return `id:${name}`; },
        get(id) {
          return { fetch(request) { seen.requests.push({ id, url: request.url, method: request.method }); return new Response('forwarded'); } };
        },
      },
    },
  });
  assert.equal(await response.text(), 'forwarded');
  assert.deepEqual(seen.names, [PARTNER_REPORT_AUTHORITY_ID]);
  assert.equal(seen.requests[0].method, 'POST');
  assert.equal(seen.requests[0].url.endsWith('/report?reportOp=read'), true);
});

const BATTLE_TICKET_ID = 't-battle-reporter-000001';
const BATTLE_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef';
const BATTLE_MATCH_ID = 'm-battle-000001';
const BATTLE_VERSIONS = Object.freeze({ rules: 'rules-1', content: 'content-2', state: 'state-3' });

function battleStorage() {
  const storage = new FakeStorage();
  storage.map.set(`match/ticket/${BATTLE_TICKET_ID}`, {
    clientId: 'battle-client-1',
    secret: BATTLE_SECRET,
    status: 'MATCHED',
    sequence: 1,
    matchId: BATTLE_MATCH_ID,
  });
  storage.map.set(`match/record/${BATTLE_MATCH_ID}`, {
    matchId: BATTLE_MATCH_ID,
    ticketIds: [BATTLE_TICKET_ID],
    aiSeats: [1, 2, 3],
    seats: [
      { slot: 0, kind: 'HUMAN', ticketId: BATTLE_TICKET_ID, clientId: 'battle-client-1', team: null },
      { slot: 1, kind: 'AI', aiId: 'AI1', team: null },
      { slot: 2, kind: 'AI', aiId: 'AI2', team: null },
      { slot: 3, kind: 'AI', aiId: 'AI3', team: null },
    ],
    format: 'FREE4P',
    fillReason: 'TEST',
    startedAtMs: 10,
  });
  return storage;
}

function battleResolution(overrides = {}) {
  const base = {
    ticketId: BATTLE_TICKET_ID,
    secret: BATTLE_SECRET,
    sourceSchema: BATTLE_RECEIPT_SOURCE_SCHEMA,
    matchId: BATTLE_MATCH_ID,
    sequence: 1,
    kind: 'battle_resolution',
    versions: { ...BATTLE_VERSIONS },
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
        { id: 'p1', name: 'DROP_PLAYER_NAME', team: 'A', score: 7, winner: true, cards: [
          { cardId: 'C-001', label: 'DROP_CARD_LABEL', value: 7, origin: 'battle' },
        ] },
        { id: 'p2', name: 'DROP_PLAYER_NAME_2', team: 'B', score: 4, winner: false, cards: [
          { cardId: 'C-002', label: 'DROP_CARD_LABEL_2', value: 4, origin: 'road' },
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
    privateData: { hand: ['DROP_PRIVATE_CARD'] },
    authorityOnly: { secret: 'DROP_AUTHORITY_ONLY' },
  };
  return { ...base, ...overrides };
}

function battleEnded(overrides = {}) {
  return {
    ticketId: BATTLE_TICKET_ID,
    secret: BATTLE_SECRET,
    sourceSchema: BATTLE_RECEIPT_SOURCE_SCHEMA,
    matchId: BATTLE_MATCH_ID,
    sequence: 2,
    kind: 'match_ended',
    versions: { ...BATTLE_VERSIONS },
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

function assertBattleReceipt(value, sequence, kind, idempotent = false) {
  assert.equal(value.ok, true);
  assert.equal(value.idempotent, idempotent);
  assert.equal(value.matchId, BATTLE_MATCH_ID);
  assert.equal(value.sequence, sequence);
  assert.equal(value.kind, kind);
  assert.deepEqual(value.versions, BATTLE_VERSIONS);
  assert.equal(value.receiptAuthority.authorityId, BATTLE_RECEIPT_AUTHORITY_ID);
  assert.equal(value.receiptAuthority.scope, 'authenticated_match_participant_receipt');
  assert.equal(value.receiptAuthority.gameplayAuthoritative, false);
}

test('authenticated matched participant stores only sanitized versioned public Battle receipt fields', async () => {
  const storage = battleStorage();
  const submitted = await submitStoredBattleReceipt(storage, battleResolution(), { nowMs: 100 });
  assertBattleReceipt(submitted, 1, 'battle_resolution');

  const read = await readStoredBattleReceipt(storage, { matchId: BATTLE_MATCH_ID, sequence: 1 });
  assert.equal(read.ok, true);
  assert.deepEqual(read.record.publicData.players[0].cards, [{ cardId: 'C-001', value: 7 }]);
  assert.equal(read.record.receiptAuthority.gameplayAuthoritative, false);
  const serialized = JSON.stringify([...storage.map.entries()]);
  for (const forbidden of ['DROP_PLAYER_NAME', 'DROP_CARD_LABEL', 'DROP_PRIVATE_CARD', 'DROP_AUTHORITY_ONLY', 'privateData', 'authorityOnly']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.equal([...storage.map.keys()].some((key) => key.startsWith(BATTLE_RECEIPT_RECORD_PREFIX)), true);
});

test('Battle receipt stream is exact-idempotent and fails closed on tamper, gap, version drift and post-terminal append', async () => {
  const storage = battleStorage();
  assertBattleReceipt(await submitStoredBattleReceipt(storage, battleResolution()), 1, 'battle_resolution');
  assertBattleReceipt(await submitStoredBattleReceipt(storage, battleResolution()), 1, 'battle_resolution', true);

  const changed = battleResolution({ publicData: { ...battleResolution().publicData, round: 2 } });
  assert.deepEqual(await submitStoredBattleReceipt(storage, changed), { ok: false, reason: 'battle_receipt_sequence_conflict' });

  const drift = battleEnded({ versions: { ...BATTLE_VERSIONS, content: 'content-new' } });
  assert.deepEqual(await submitStoredBattleReceipt(storage, drift), { ok: false, reason: 'battle_receipt_version_conflict' });

  assertBattleReceipt(await submitStoredBattleReceipt(storage, battleEnded()), 2, 'match_ended');
  const after = battleResolution({ sequence: 3, publicData: { ...battleResolution().publicData, serial: 2, round: 2 } });
  assert.deepEqual(await submitStoredBattleReceipt(storage, after), { ok: false, reason: 'battle_receipt_terminal' });

  const gapStorage = battleStorage();
  assert.deepEqual(await submitStoredBattleReceipt(gapStorage, battleEnded()), { ok: false, reason: 'battle_receipt_sequence_gap' });
});

test('wrong Battle ticket secret, wrong match, unsupported replay schema, and oversized HTTP payload never gain receipt authority', async () => {
  const storage = battleStorage();
  assert.deepEqual(await submitStoredBattleReceipt(storage, battleResolution({ secret: 'f'.repeat(48) })), {
    ok: false, reason: 'battle_receipt_auth_invalid',
  });
  assert.deepEqual(await submitStoredBattleReceipt(storage, battleResolution({ matchId: 'm-battle-other-000001' })), {
    ok: false, reason: 'battle_receipt_match_invalid',
  });
  assert.deepEqual(await submitStoredBattleReceipt(storage, battleResolution({ sourceSchema: 'OTHER_SCHEMA' })), {
    ok: false, reason: 'battle_receipt_request_invalid',
  });

  const large = new Request('https://example.test/report?battleEventOp=submit', {
    method: 'POST', headers: { 'content-length': '20000' }, body: '{}',
  });
  const largeResponse = await handleBattleReceiptRequest(storage, large, new URL(large.url));
  assert.equal(largeResponse.status, 413);
});

test('Battle HTTP receipt explicitly verifies participant receipt only and never claims gameplay authority', async () => {
  const storage = battleStorage();
  const request = new Request('https://example.test/report?battleEventOp=submit', {
    method: 'POST', body: JSON.stringify(battleResolution()),
  });
  const response = await handleBattleReceiptRequest(storage, request, new URL(request.url), { nowMs: 222 });
  assert.equal(response.status, 200);
  const value = await response.json();
  assertBattleReceipt(value, 1, 'battle_resolution');
  assert.equal(value.receiptAuthority.gameplayAuthoritative, false);
});

test('existing /report Pages function sends battleEventOp to exact normal-match queue DO while preserving Partner report authority route', async () => {
  const seen = { names: [], requests: [] };
  const env = {
    GAMEROAD_ROOMS: {
      idFromName(name) { seen.names.push(name); return `id:${name}`; },
      get(id) { return { fetch(request) { seen.requests.push({ id, url: request.url }); return new Response('forwarded'); } }; },
    },
  };
  const battle = await reportRoute({
    request: new Request('https://example.test/report?battleEventOp=submit&queue=normal-main', { method: 'POST', body: '{}' }),
    env,
  });
  assert.equal(await battle.text(), 'forwarded');
  assert.equal(seen.names.at(-1), 'gameroad.normal.normal-main');

  const invalid = await reportRoute({
    request: new Request('https://example.test/report?battleEventOp=submit&queue=x', { method: 'POST', body: '{}' }),
    env,
  });
  assert.equal(invalid.status, 400);
});

test('production relay mounts report, Battle receipt, then existing match gate without changing WebSocket fallback', async () => {
  const source = await readFile(new URL('../relay/src/relay-worker.mjs', import.meta.url), 'utf8');
  assert.match(source, /import \{ handleBattleReceiptRequest, handlePartnerReportRequest \} from '\.\/partner-report-store\.mjs';/);
  const reportIndex = source.indexOf("if (url.searchParams.has('reportOp')) return handlePartnerReportRequest(this.ctx.storage, request, url);");
  const battleIndex = source.indexOf("if (url.searchParams.has('battleEventOp')) return handleBattleReceiptRequest(this.ctx.storage, request, url);");
  const matchIndex = source.indexOf("if (url.searchParams.has('matchOp')) return handleMatchRequest(this.ctx, request, url);");
  const fallbackIndex = source.indexOf("return new Response('WebSocket upgrade required'");
  assert.equal(reportIndex >= 0, true);
  assert.equal(battleIndex > reportIndex, true);
  assert.equal(matchIndex > battleIndex, true);
  assert.equal(fallbackIndex > matchIndex, true);
});
