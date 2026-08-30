import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPartnerReportCollectiveEvidenceSource,
  PARTNER_REPORT_COLLECTIVE_EVIDENCE_SOURCE,
} from '../browser/partner-report-collective-evidence-source.mjs';
import {
  PARTNER_CONVERSATION_COLLECTIVE_CONTEXT_SCHEMA,
} from '../browser/partner-conversation-collective-context.mjs';

function reportRead(overrides = {}) {
  return {
    ok: true,
    status: 'ready',
    reportId: 'report-1',
    reportType: 'defect',
    disposition: 'accepted_unique',
    partnerId: 'partner.saasuna',
    sourceUseSite: 'partner-report',
    sourceStateIdentity: 'partner-report-state-1',
    versions: {
      rules: 'rules-v1',
      content: 'content-v1',
      state: 'state-v1',
    },
    authority: {
      verified: true,
      authorityId: 'partner-report-authority:v1',
    },
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    partnerId: 'partner.saasuna',
    useSite: 'partner-conversation',
    schemaVersion: PARTNER_CONVERSATION_COLLECTIVE_CONTEXT_SCHEMA,
    ...overrides,
  };
}

const fixedClock = () => new Date('2026-08-31T00:00:00.000Z');

test('accepted authoritative report composes into the strict collective-context contract with a direct current read each call', () => {
  let reads = 0;
  const source = createPartnerReportCollectiveEvidenceSource({
    readCurrentAdjudicatedReports() {
      reads += 1;
      return [reportRead()];
    },
    clock: fixedClock,
  });

  const first = source(request());
  const second = source(request());

  assert.equal(reads, 2);
  assert.equal(first.ok, true);
  assert.equal(first.schemaVersion, PARTNER_CONVERSATION_COLLECTIVE_CONTEXT_SCHEMA);
  assert.equal(first.partnerId, 'partner.saasuna');
  assert.equal(first.safeForPrompt, true);
  assert.equal(first.containsPrivate, false);
  assert.equal(first.containsRawUserText, false);
  assert.equal(first.secondRecorderCreated, false);
  assert.equal(first.acceptedCount, 1);
  assert.deepEqual(first.items, [{
    evidenceId: 'partner-report:report-1',
    summary: 'Current server-verified report contribution records an accepted issue for this partner.',
    confidence: 'server_verified',
    counterevidenceState: 'NONE_FOUND',
  }]);
  assert.deepEqual(first.lineage, [{
    evidenceId: 'partner-report:report-1',
    sourceId: 'partner-report-authority',
    sourceVersion: 'rules-v1|content-v1|state-v1',
    provenance: 'server_verified',
    authorityRef: 'partner-report-authority:v1',
    observedAt: '2026-08-31T00:00:00.000Z',
    freshness: 'current',
    counterevidenceState: 'NONE_FOUND',
  }]);
  assert.deepEqual(second, first);
});

test('raw report fields and private-looking payloads never cross into the collective prompt context', () => {
  const marker = 'RAW_PRIVATE_CONVERSATION_MARKER';
  const source = createPartnerReportCollectiveEvidenceSource({
    readCurrentAdjudicatedReports: () => [reportRead({
      rawText: marker,
      message: marker,
      privateConversation: { transcript: marker },
      userText: marker,
    })],
    clock: fixedClock,
  });

  const context = source(request());
  assert.equal(context.containsPrivate, false);
  assert.equal(context.containsRawUserText, false);
  assert.equal(JSON.stringify(context).includes(marker), false);
});

test('duplicate, rejected, malformed, unverified, and wrong-partner reports fail closed when no eligible report remains', () => {
  const candidates = [
    reportRead({ reportId: 'duplicate', disposition: 'duplicate' }),
    reportRead({ reportId: 'rejected', disposition: 'rejected' }),
    reportRead({ reportId: 'malformed', status: 'pending' }),
    reportRead({ reportId: 'unverified', authority: { verified: false, authorityId: 'bad' } }),
    reportRead({ reportId: 'wrong-partner', partnerId: 'partner.other' }),
  ];
  const source = createPartnerReportCollectiveEvidenceSource({
    readCurrentAdjudicatedReports: () => candidates,
    clock: fixedClock,
  });

  assert.equal(source(request()), null);
});

test('reader failures, invalid reader results, invalid requests, and invalid clock values return null without mutation or throw', () => {
  const throwing = createPartnerReportCollectiveEvidenceSource({
    readCurrentAdjudicatedReports() {
      throw new Error('reader unavailable');
    },
    clock: fixedClock,
  });
  assert.equal(throwing(request()), null);

  const malformed = createPartnerReportCollectiveEvidenceSource({
    readCurrentAdjudicatedReports: () => ({ not: 'an-array' }),
    clock: fixedClock,
  });
  assert.equal(malformed(request()), null);
  assert.equal(malformed(request({ useSite: 'other' })), null);
  assert.equal(malformed(request({ schemaVersion: 'wrong-schema' })), null);

  const badClock = createPartnerReportCollectiveEvidenceSource({
    readCurrentAdjudicatedReports: () => [reportRead()],
    clock: () => 'not-a-date',
  });
  assert.equal(badClock(request()), null);
});

test('source is bounded to four accepted evidence items and collective dedupe remains authoritative', () => {
  const reports = Array.from({ length: 8 }, (_, index) => reportRead({
    reportId: index < 2 ? 'same' : `report-${index}`,
    sourceStateIdentity: `state-${index}`,
  }));
  const source = createPartnerReportCollectiveEvidenceSource({
    readCurrentAdjudicatedReports: () => reports,
    clock: fixedClock,
  });

  const context = source(request());
  assert.equal(context.acceptedCount, 3);
  assert.deepEqual(context.items.map((item) => item.evidenceId), [
    'partner-report:same',
    'partner-report:report-2',
    'partner-report:report-3',
  ]);
});

test('contract explicitly creates no storage authority, cache, raw-text projection, or automatic mutation', () => {
  assert.deepEqual(PARTNER_REPORT_COLLECTIVE_EVIDENCE_SOURCE, {
    schema: 'gameroad.partner-report-collective-evidence-source.v1',
    inputAuthority: 'CURRENT_AUTHORITATIVE_PARTNER_REPORT_READ',
    outputSchema: PARTNER_CONVERSATION_COLLECTIVE_CONTEXT_SCHEMA,
    useSite: 'partner-conversation',
    storageAuthority: 'NONE',
    cachePolicy: 'NONE_DIRECT_CURRENT_READ_EACH_CALL',
    rawReportTextPolicy: 'NEVER_PROJECT_RAW_REPORT_TEXT',
    automaticMutationPolicy: 'NONE',
    maxSourceReports: 16,
    maxEvidenceItems: 4,
  });
});

test('dependency contracts reject missing reader or non-function clock immediately', () => {
  assert.throws(() => createPartnerReportCollectiveEvidenceSource(), /readCurrentAdjudicatedReports/);
  assert.throws(() => createPartnerReportCollectiveEvidenceSource({
    readCurrentAdjudicatedReports: () => [],
    clock: 'not-a-function',
  }), /clock/);
});
