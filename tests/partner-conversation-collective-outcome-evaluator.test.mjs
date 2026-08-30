import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluatePartnerConversationCollectiveExperiment,
  normalizePartnerConversationOutcomeReceipt,
} from '../browser/partner-conversation-collective-outcome-evaluator.mjs';
import { PARTNER_CONVERSATION_COLLECTIVE_CONTEXT_SCHEMA } from '../browser/partner-conversation-collective-context.mjs';

function receipt(overrides = {}) {
  return {
    experimentId: 'saasuna-collective-r15',
    caseId: 'case-1',
    caseVersion: 'v1',
    partnerId: 'partner.saasuna',
    arm: 'NO_COLLECTIVE',
    traceId: 'trace-baseline-1',
    observedAt: '2026-08-31T02:40:00+09:00',
    traceAuthority: 'approved',
    traceProvenance: 'server_verified',
    contextSchemaVersion: 'none',
    contextEvidenceIds: [],
    responseDelivered: true,
    fallbackUsed: true,
    providerCandidateAccepted: false,
    latencyMs: 900,
    humanUsefulnessVerdict: 'REJECTED',
    ...overrides,
  };
}

function treatment(overrides = {}) {
  return receipt({
    arm: 'COLLECTIVE_CONTEXT',
    traceId: 'trace-treatment-1',
    traceProvenance: 'public_production',
    contextSchemaVersion: PARTNER_CONVERSATION_COLLECTIVE_CONTEXT_SCHEMA,
    contextEvidenceIds: ['ev-1', 'ev-2'],
    fallbackUsed: false,
    providerCandidateAccepted: true,
    latencyMs: 700,
    humanUsefulnessVerdict: 'ACCEPTED',
    ...overrides,
  });
}

test('strict receipt rejects raw dialogue or any unexpected field', () => {
  assert.throws(() => normalizePartnerConversationOutcomeReceipt(receipt({ userMessage: 'secret text' })), /unexpected_or_text_bearing_field/);
  assert.throws(() => normalizePartnerConversationOutcomeReceipt(receipt({ providerPayload: { raw: true } })), /unexpected_or_text_bearing_field/);
});

test('only Saasuna and approved production trace provenance are accepted', () => {
  assert.throws(() => normalizePartnerConversationOutcomeReceipt(receipt({ partnerId: 'partner.other' })), /partnerId_not_saasuna/);
  assert.throws(() => normalizePartnerConversationOutcomeReceipt(receipt({ traceAuthority: 'unknown' })), /traceAuthority_not_approved/);
  assert.throws(() => normalizePartnerConversationOutcomeReceipt(receipt({ traceProvenance: 'synthetic' })), /traceProvenance_not_production/);
});

test('collective treatment requires the current context schema and bounded evidence ids', () => {
  assert.throws(() => normalizePartnerConversationOutcomeReceipt(treatment({ contextSchemaVersion: 'old-schema' })), /collective_context_schema_not_current/);
  assert.throws(() => normalizePartnerConversationOutcomeReceipt(treatment({ contextEvidenceIds: [] })), /collective_context_evidence_required/);
  assert.throws(() => normalizePartnerConversationOutcomeReceipt(treatment({ contextEvidenceIds: ['ev-1', 'ev-1'] })), /contextEvidenceIds_duplicate/);
});

test('baseline cannot smuggle collective context evidence', () => {
  assert.throws(() => normalizePartnerConversationOutcomeReceipt(receipt({ contextSchemaVersion: PARTNER_CONVERSATION_COLLECTIVE_CONTEXT_SCHEMA })), /baseline_context_schema_must_be_none/);
  assert.throws(() => normalizePartnerConversationOutcomeReceipt(receipt({ contextEvidenceIds: ['ev-1'] })), /baseline_context_evidence_forbidden/);
});

test('provider and human-review outcomes fail closed on inconsistent receipts', () => {
  assert.throws(() => normalizePartnerConversationOutcomeReceipt(receipt({ providerCandidateAccepted: true })), /provider_outcome_inconsistent/);
  assert.throws(() => normalizePartnerConversationOutcomeReceipt(receipt({ responseDelivered: false, humanUsefulnessVerdict: 'ACCEPTED' })), /human_review_requires_delivered_response/);
});

test('paired descriptive evaluation reports delivery, fallback, provider, latency, and Human usefulness without quality claim', () => {
  const report = evaluatePartnerConversationCollectiveExperiment([receipt(), treatment()]);
  assert.equal(report.pairedCaseCount, 1);
  assert.equal(report.unpairedCaseCount, 0);
  assert.equal(report.paired.baseline.deliveryRate, 1);
  assert.equal(report.paired.treatment.deliveryRate, 1);
  assert.equal(report.paired.deltaTreatmentMinusBaseline.fallbackRate, -1);
  assert.equal(report.paired.deltaTreatmentMinusBaseline.providerAcceptanceRate, 1);
  assert.equal(report.paired.deltaTreatmentMinusBaseline.meanLatencyMs, -200);
  assert.equal(report.paired.deltaTreatmentMinusBaseline.humanAcceptanceRate, 1);
  assert.deepEqual(report.paired.humanUsefulnessOutcome, {
    treatmentWins: 1,
    baselineWins: 0,
    ties: 0,
    notComparable: 0,
  });
  assert.equal(report.interpretation.causalClaim, false);
  assert.equal(report.interpretation.productQualityClaim, false);
  assert.equal(report.interpretation.humanFormalGateRequired, true);
  assert.equal(report.containsPrivate, false);
  assert.equal(report.containsRawUserText, false);
  assert.equal(Object.isFrozen(report), true);
});

test('unpaired receipts are listed and excluded from paired metrics', () => {
  const report = evaluatePartnerConversationCollectiveExperiment([receipt()]);
  assert.equal(report.pairedCaseCount, 0);
  assert.equal(report.unpairedCaseCount, 1);
  assert.equal(report.paired.baseline.count, 0);
  assert.equal(report.paired.treatment.count, 0);
  assert.equal(report.paired.deltaTreatmentMinusBaseline.deliveryRate, null);
  assert.deepEqual(report.unpaired[0], {
    experimentId: 'saasuna-collective-r15',
    caseId: 'case-1',
    caseVersion: 'v1',
    presentArm: 'NO_COLLECTIVE',
    missingArm: 'COLLECTIVE_CONTEXT',
  });
});

test('duplicate arm for a pair is rejected rather than silently overwritten', () => {
  assert.throws(
    () => evaluatePartnerConversationCollectiveExperiment([receipt(), receipt({ traceId: 'trace-baseline-2' })]),
    /duplicate_arm_for_pair/,
  );
});

test('Human usefulness remains non-comparable until both paired arms are reviewed', () => {
  const report = evaluatePartnerConversationCollectiveExperiment([
    receipt({ humanUsefulnessVerdict: 'NOT_REVIEWED' }),
    treatment(),
  ]);
  assert.equal(report.paired.baseline.humanReviewedCount, 0);
  assert.equal(report.paired.baseline.humanAcceptanceRate, null);
  assert.equal(report.paired.deltaTreatmentMinusBaseline.humanAcceptanceRate, null);
  assert.equal(report.paired.humanUsefulnessOutcome.notComparable, 1);
  assert.equal(report.interpretation.productQualityClaim, false);
});
