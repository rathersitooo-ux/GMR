import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARTNER_REPORT_CONTRIBUTION_EVENT_SOURCE,
  createPartnerReportContributionConsumerAdapter,
  projectPartnerReportContribution
} from '../browser/partner-report-contribution-event-source.mjs';

function accepted(overrides = {}) {
  return {
    ok: true,
    status: 'ready',
    reportId: 'report-42',
    reportType: 'bug',
    disposition: 'accepted_unique',
    partnerId: 'partner.naki',
    sourceUseSite: 'partner_report',
    sourceStateIdentity: 'report-state-9',
    versions: {
      rules: 'rules-1',
      content: 'content-2',
      state: 'state-3'
    },
    authority: {
      verified: true,
      authorityId: 'report-authority-current'
    },
    rawReportText: 'this must never be projected',
    affinityDelta: 999,
    reward: { coins: 999 },
    ...overrides
  };
}

test('accepted unique report projects a frozen sanitized handoff candidate without inventing affinity', () => {
  const output = projectPartnerReportContribution(accepted());

  assert.equal(output.ok, true);
  assert.equal(output.contributionEligible, true);
  assert.equal(output.relationshipHandoffCandidate.eventIdentity, 'partner-report:report-42');
  assert.equal(output.relationshipHandoffCandidate.eventType, 'report_contribution');
  assert.equal(output.relationshipHandoffCandidate.partnerId, 'partner.naki');
  assert.equal(output.relationshipHandoffCandidate.sourceReportType, 'bug');
  assert.equal(output.relationshipHandoffCandidate.sourceDisposition, 'accepted_unique');
  assert.deepEqual(output.relationshipHandoffCandidate.rulesContentVersion, {
    rules: 'rules-1',
    content: 'content-2',
    state: 'state-3'
  });
  assert.deepEqual(output.relationshipHandoffCandidate.authorityValidation, {
    verified: true,
    authorityId: 'report-authority-current'
  });
  assert.equal(Object.isFrozen(output), true);
  assert.equal(Object.isFrozen(output.relationshipHandoffCandidate), true);
  assert.equal('rawReportText' in output, false);
  assert.equal('rawReportText' in output.relationshipHandoffCandidate, false);
  assert.equal('affinityDelta' in output.relationshipHandoffCandidate, false);
  assert.equal('reward' in output.relationshipHandoffCandidate, false);
});

test('stable report identity gives deterministic exactly-once handoff identity', () => {
  const first = projectPartnerReportContribution(accepted());
  const retry = projectPartnerReportContribution(accepted());

  assert.equal(first.relationshipHandoffCandidate.eventIdentity, retry.relationshipHandoffCandidate.eventIdentity);
  assert.equal(first.relationshipHandoffCandidate.eventContentIdentity, retry.relationshipHandoffCandidate.eventContentIdentity);
});

test('same event identity with changed authoritative content exposes a different content identity', () => {
  const first = projectPartnerReportContribution(accepted());
  const changed = projectPartnerReportContribution(accepted({ partnerId: 'partner.mato' }));

  assert.equal(first.relationshipHandoffCandidate.eventIdentity, changed.relationshipHandoffCandidate.eventIdentity);
  assert.notEqual(first.relationshipHandoffCandidate.eventContentIdentity, changed.relationshipHandoffCandidate.eventContentIdentity);
});

test('duplicate and rejected adjudications remain visible outcomes but never emit relationship handoffs', () => {
  for (const disposition of ['duplicate', 'rejected']) {
    const output = projectPartnerReportContribution(accepted({ disposition }));
    assert.equal(output.ok, true);
    assert.equal(output.contributionEligible, false);
    assert.equal(output.relationshipHandoffCandidate, null);
    assert.equal(output.disposition, disposition);
  }
});

test('Good/Bad conversation quality signals are not accepted as report contribution types', () => {
  for (const reportType of ['good', 'bad']) {
    assert.deepEqual(projectPartnerReportContribution(accepted({ reportType })), {
      ok: false,
      reason: 'REPORT_IDENTITY_OR_DISPOSITION_INVALID'
    });
  }
});

test('missing or unverified authority fails closed', () => {
  assert.deepEqual(projectPartnerReportContribution(accepted({ authority: null })), {
    ok: false,
    reason: 'REPORT_VERSION_OR_AUTHORITY_INVALID'
  });
  assert.deepEqual(projectPartnerReportContribution(accepted({ authority: { verified: false, authorityId: 'x' } })), {
    ok: false,
    reason: 'REPORT_VERSION_OR_AUTHORITY_INVALID'
  });
});

test('unknown report type, disposition, partner identity, or version fails closed', () => {
  const invalids = [
    accepted({ reportType: 'praise' }),
    accepted({ disposition: 'pending' }),
    accepted({ partnerId: '' }),
    accepted({ sourceUseSite: '' }),
    accepted({ sourceStateIdentity: '' }),
    accepted({ versions: { rules: 'rules-1', content: '', state: 'state-3' } })
  ];
  for (const input of invalids) assert.equal(projectPartnerReportContribution(input).ok, false);
});

test('consumer adapter delivers one frozen sanitized candidate for an accepted unique report', () => {
  const consumed = [];
  const run = createPartnerReportContributionConsumerAdapter({
    readAdjudicatedReport: () => accepted(),
    consumeRelationshipHandoff: candidate => consumed.push(candidate)
  });

  const result = run();
  assert.equal(result.ok, true);
  assert.equal(result.consumed, true);
  assert.equal(consumed.length, 1);
  assert.equal(Object.isFrozen(consumed[0]), true);
  assert.equal(consumed[0].eventIdentity, 'partner-report:report-42');
  assert.equal('rawReportText' in consumed[0], false);
  assert.equal('affinityDelta' in consumed[0], false);
  assert.equal('reward' in consumed[0], false);
});

test('consumer adapter does not call relationship consumer for duplicate or rejected reports', () => {
  for (const disposition of ['duplicate', 'rejected']) {
    let calls = 0;
    const run = createPartnerReportContributionConsumerAdapter({
      readAdjudicatedReport: () => accepted({ disposition }),
      consumeRelationshipHandoff: () => { calls += 1; }
    });
    const result = run();
    assert.equal(result.ok, true);
    assert.equal(result.consumed, false);
    assert.equal(result.contributionEligible, false);
    assert.equal(result.disposition, disposition);
    assert.equal(calls, 0);
  }
});

test('reader and relationship consumer failures are isolated', () => {
  const readFailure = createPartnerReportContributionConsumerAdapter({
    readAdjudicatedReport: () => { throw new Error('boom'); },
    consumeRelationshipHandoff: () => {}
  });
  assert.deepEqual(readFailure(), { ok: false, consumed: false, reason: 'REPORT_READ_FAILED' });

  const consumerFailure = createPartnerReportContributionConsumerAdapter({
    readAdjudicatedReport: () => accepted(),
    consumeRelationshipHandoff: () => { throw new Error('boom'); }
  });
  assert.deepEqual(consumerFailure(), { ok: false, consumed: false, reason: 'RELATIONSHIP_CONSUMER_FAILED' });
});

test('public contract explicitly has no storage authority, raw report text, Good/Bad coupling, or numeric mutation', () => {
  assert.equal(PARTNER_REPORT_CONTRIBUTION_EVENT_SOURCE.storageAuthority, 'NONE');
  assert.equal(PARTNER_REPORT_CONTRIBUTION_EVENT_SOURCE.rawReportTextPolicy, 'NEVER_PROJECT_RAW_REPORT_TEXT');
  assert.equal(PARTNER_REPORT_CONTRIBUTION_EVENT_SOURCE.goodBadPolicy, 'SEPARATE_CONVERSATION_QUALITY_SIGNAL_NOT_A_REPORT_CONTRIBUTION');
  assert.equal(PARTNER_REPORT_CONTRIBUTION_EVENT_SOURCE.relationshipMutationPolicy, 'HANDOFF_CANDIDATE_ONLY_NO_NUMERIC_DELTA');
  assert.deepEqual([...PARTNER_REPORT_CONTRIBUTION_EVENT_SOURCE.acceptedReportTypes], ['bug', 'defect', 'request']);
});
