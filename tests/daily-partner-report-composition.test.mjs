import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DAILY_PARTNER_REPORT_STOP_ID,
  composeDailyStopsWithPartnerReport,
  composePartnerReportDailyStop,
  composePartnerReportDailyStopFromAdjudicatedRead,
} from '../browser/daily-partner-report-composition.mjs';
import {
  createDailyTourPlan,
  advanceDailyTour,
  summarizeDailyTour,
} from '../browser/daily-tour-core.mjs';

function adjudicatedReport(disposition = 'accepted_unique') {
  return {
    ok: true,
    status: 'ready',
    reportId: 'report-42',
    reportType: 'bug',
    disposition,
    partnerId: 'partner-naki',
    sourceUseSite: 'partner-conversation',
    sourceStateIdentity: 'state-7',
    versions: { rules: 'r1', content: 'c1', state: 's1' },
    authority: { verified: true, authorityId: 'report-authority-v1' },
  };
}

test('unregistered Partner report never auto-inserts into Daily', () => {
  const composed = composeDailyStopsWithPartnerReport({
    stops: [{ id: 'brain_training', kind: 'interactive', registered: true, eligible: true }],
    registeredStopIds: ['brain_training'],
    providerState: 'READY',
  });

  assert.deepEqual(composed.stops.map((stop) => stop.id), ['brain_training']);
  assert.equal(composed.partnerReport.available, false);
  assert.equal(composed.partnerReport.disposition, 'UNREGISTERED');
  assert.equal(composed.partnerReport.reason, 'EXPLICIT_REGISTRATION_REQUIRED');
  assert.equal(composed.partnerReport.autoInsertUnregisteredAllowed, false);
});

test('registered Partner report remains deferred while formal report provider is absent', () => {
  const composed = composeDailyStopsWithPartnerReport({
    stops: [{ id: 'brain_training', kind: 'interactive', registered: true, eligible: true }],
    registeredStopIds: ['brain_training', DAILY_PARTNER_REPORT_STOP_ID],
    providerState: 'ABSENT',
  });

  assert.deepEqual(composed.stops.map((stop) => stop.id), ['brain_training']);
  assert.equal(composed.partnerReport.available, false);
  assert.equal(composed.partnerReport.disposition, 'DEFERRED_PROVIDER_REQUIRED');
  assert.equal(composed.partnerReport.reason, 'REPORT_PROVIDER_NOT_READY');
  assert.equal(composed.partnerReport.relationshipMutationAllowed, false);
  assert.equal(composed.partnerReport.rewardMutationAllowed, false);
  assert.equal(composed.partnerReport.saveAuthorityOwnedHere, false);
});

test('explicitly registered report is appended only when provider is READY and preserves existing order', () => {
  const composed = composeDailyStopsWithPartnerReport({
    stops: [
      { id: 'fossil', kind: 'interactive', registered: true, eligible: true },
      { id: 'brain_training', kind: 'interactive', registered: true, eligible: true },
    ],
    registeredStopIds: ['fossil', 'brain_training', DAILY_PARTNER_REPORT_STOP_ID],
    providerState: 'READY',
    statusAvailable: true,
  });

  assert.deepEqual(composed.stops.map((stop) => stop.id), ['fossil', 'brain_training', DAILY_PARTNER_REPORT_STOP_ID]);
  assert.equal(composed.partnerReport.available, true);
  assert.deepEqual(composed.partnerReport.handoff, {
    kind: 'partner_report_daily_handoff',
    downstreamUseSite: 'partner-conversation',
    action: 'open_report',
    reportProviderRequired: true,
    statusAvailable: true,
  });
});

test('authoritative adjudicated report read becomes a neutral Daily status stop', () => {
  const result = composePartnerReportDailyStopFromAdjudicatedRead({
    registeredStopIds: [DAILY_PARTNER_REPORT_STOP_ID],
    reportRead: adjudicatedReport('accepted_unique'),
  });

  assert.equal(result.available, true);
  assert.equal(result.providerSource, 'adjudicated_report_read');
  assert.equal(result.sourceDisposition, 'accepted_unique');
  assert.equal(result.reportStatus.authoritative, true);
  assert.equal(result.reportStatus.status, 'accepted');
  assert.equal(result.reportStatus.message, '報告を受け付けました。');
  assert.deepEqual(result.handoff, {
    kind: 'partner_report_status_daily_handoff',
    downstreamUseSite: 'partner-report-status',
    action: 'show_report_status',
    reportProviderRequired: true,
    statusAvailable: true,
    reportId: 'report-42',
    statusKey: 'partner_report_accepted',
    nextAction: 'none',
  });
});

test('duplicate and rejected adjudications remain status-only and never become invented contributions', () => {
  for (const [disposition, status] of [['duplicate', 'duplicate'], ['rejected', 'rejected']]) {
    const result = composePartnerReportDailyStopFromAdjudicatedRead({
      registeredStopIds: [DAILY_PARTNER_REPORT_STOP_ID],
      reportRead: adjudicatedReport(disposition),
    });
    assert.equal(result.available, true);
    assert.equal(result.reportStatus.status, status);
    assert.equal(result.relationshipMutationAllowed, false);
    assert.equal(result.rewardMutationAllowed, false);
    assert.equal(result.saveAuthorityOwnedHere, false);
    assert.equal('affinityDelta' in result, false);
    assert.equal('contributionDelta' in result, false);
  }
});

test('unready or invalid adjudicated report read fails closed instead of creating a Daily stop', () => {
  const reportRead = { ...adjudicatedReport(), status: 'pending' };
  const result = composePartnerReportDailyStopFromAdjudicatedRead({
    registeredStopIds: [DAILY_PARTNER_REPORT_STOP_ID],
    reportRead,
  });

  assert.equal(result.available, false);
  assert.equal(result.disposition, 'DEFERRED_PROVIDER_REQUIRED');
  assert.equal(result.reason, 'REPORT_PROVIDER_NOT_READY');
  assert.equal(result.sourceReason, 'REPORT_NOT_READY');
  assert.equal(result.reportStatus, null);
});

test('unregistered adjudicated report is not consumed as a Daily status', () => {
  const result = composePartnerReportDailyStopFromAdjudicatedRead({
    registeredStopIds: [],
    reportRead: adjudicatedReport(),
  });

  assert.equal(result.available, false);
  assert.equal(result.disposition, 'UNREGISTERED');
  assert.equal(result.reportStatus, null);
  assert.equal(result.sourceReason, null);
});

test('existing Daily core receives adjudicated Partner report status as optional stop with no skip debt', () => {
  const registeredStopIds = ['brain_training', DAILY_PARTNER_REPORT_STOP_ID];
  const composed = composeDailyStopsWithPartnerReport({
    stops: [{ id: 'brain_training', kind: 'interactive', registered: true, eligible: true }],
    registeredStopIds,
    adjudicatedReportRead: adjudicatedReport(),
  });

  assert.equal(composed.partnerReport.reportStatus.status, 'accepted');
  const plan = createDailyTourPlan({
    dayKey: '2026-08-30',
    stops: composed.stops,
    registeredStopIds: composed.registeredStopIds,
    includeBattleFinale: false,
  });
  assert.deepEqual(plan.route.map((stop) => stop.id), ['brain_training', DAILY_PARTNER_REPORT_STOP_ID]);

  const afterBrain = advanceDailyTour(plan, { type: 'complete_stop', stopId: 'brain_training' });
  const afterSkip = advanceDailyTour(afterBrain, { type: 'skip_stop', stopId: DAILY_PARTNER_REPORT_STOP_ID });
  const summary = summarizeDailyTour(afterSkip);
  assert.equal(summary.tourSettled, true);
  assert.equal(summary.hasDebt, false);
  assert.equal(summary.skippedStopCount, 1);
});

test('composition never grants relationship, reward, save or raw-chat collection authority', () => {
  const result = composePartnerReportDailyStopFromAdjudicatedRead({
    registeredStopIds: [DAILY_PARTNER_REPORT_STOP_ID],
    reportRead: adjudicatedReport(),
  });

  assert.equal(result.relationshipMutationAllowed, false);
  assert.equal(result.rewardMutationAllowed, false);
  assert.equal(result.saveAuthorityOwnedHere, false);
  assert.equal(result.rawFreeTalkAutoCollectionAllowed, false);
  assert.equal(result.mandatoryDailyAllowed, false);
  assert.equal(result.streakDebtAllowed, false);
});
