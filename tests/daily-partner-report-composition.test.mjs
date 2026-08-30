import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DAILY_PARTNER_REPORT_STOP_ID,
  composeDailyStopsWithPartnerReport,
  composePartnerReportDailyStop,
} from '../browser/daily-partner-report-composition.mjs';
import {
  createDailyTourPlan,
  advanceDailyTour,
  summarizeDailyTour,
} from '../browser/daily-tour-core.mjs';

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

test('existing Daily core receives Partner report as an optional registered stop with no skip debt', () => {
  const registeredStopIds = ['brain_training', DAILY_PARTNER_REPORT_STOP_ID];
  const composed = composeDailyStopsWithPartnerReport({
    stops: [{ id: 'brain_training', kind: 'interactive', registered: true, eligible: true }],
    registeredStopIds,
    providerState: 'READY',
  });

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
  const result = composePartnerReportDailyStop({
    registeredStopIds: [DAILY_PARTNER_REPORT_STOP_ID],
    providerState: 'READY',
  });

  assert.equal(result.relationshipMutationAllowed, false);
  assert.equal(result.rewardMutationAllowed, false);
  assert.equal(result.saveAuthorityOwnedHere, false);
  assert.equal(result.rawFreeTalkAutoCollectionAllowed, false);
  assert.equal(result.mandatoryDailyAllowed, false);
  assert.equal(result.streakDebtAllowed, false);
});
