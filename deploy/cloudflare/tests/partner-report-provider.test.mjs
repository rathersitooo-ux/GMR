import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PARTNER_REPORT_AUTHORITY_ID,
  PARTNER_REPORT_CANONICAL_PREFIX,
  PARTNER_REPORT_IDEMPOTENCY_PREFIX,
  PARTNER_REPORT_RECORD_PREFIX,
  handlePartnerReportRequest,
  readStoredPartnerReport,
  submitStoredPartnerReport,
} from '../relay/src/partner-report-store.mjs';
import { onRequest as reportRoute } from '../functions/report.js';

class FakeStorage {
  constructor() { this.map = new Map(); }
  async get(key) { return this.map.has(key) ? structuredClone(this.map.get(key)) : undefined; }
  async put(key, value) { this.map.set(key, structuredClone(value)); }
  async delete(key) { return this.map.delete(key); }
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

test('production relay adds only the reportOp non-WebSocket gate while preserving existing match gate', async () => {
  const source = await readFile(new URL('../relay/src/relay-worker.mjs', import.meta.url), 'utf8');
  assert.match(source, /import \{ handlePartnerReportRequest \} from '\.\/partner-report-store\.mjs';/);
  const reportIndex = source.indexOf("if (url.searchParams.has('reportOp')) return handlePartnerReportRequest(this.ctx.storage, request, url);");
  const matchIndex = source.indexOf("if (url.searchParams.has('matchOp')) return handleMatchRequest(this.ctx, request, url);");
  const fallbackIndex = source.indexOf("return new Response('WebSocket upgrade required'");
  assert.equal(reportIndex >= 0, true);
  assert.equal(matchIndex > reportIndex, true);
  assert.equal(fallbackIndex > matchIndex, true);
});
