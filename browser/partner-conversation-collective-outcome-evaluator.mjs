import { PARTNER_CONVERSATION_COLLECTIVE_CONTEXT_SCHEMA } from './partner-conversation-collective-context.mjs';

const SCHEMA_VERSION = 'gameroad.partner-conversation-collective-outcome-eval.v1';
const PARTNER_ID = 'partner.saasuna';
const BASELINE_ARM = 'NO_COLLECTIVE';
const TREATMENT_ARM = 'COLLECTIVE_CONTEXT';
const ARMS = new Set([BASELINE_ARM, TREATMENT_ARM]);
const TRACE_PROVENANCE = new Set(['server_verified', 'public_production']);
const HUMAN_VERDICTS = new Set(['ACCEPTED', 'REJECTED', 'NOT_REVIEWED']);
const ALLOWED_FIELDS = new Set([
  'experimentId',
  'caseId',
  'caseVersion',
  'partnerId',
  'arm',
  'traceId',
  'observedAt',
  'traceAuthority',
  'traceProvenance',
  'contextSchemaVersion',
  'contextEvidenceIds',
  'responseDelivered',
  'fallbackUsed',
  'providerCandidateAccepted',
  'latencyMs',
  'humanUsefulnessVerdict',
]);

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function exactToken(value, name, max = 240) {
  if (typeof value !== 'string' || !value || value.length > max || value.trim() !== value || value.includes('\u0000')) {
    throw new Error(`${name}_invalid`);
  }
  return value;
}

function exactBoolean(value, name) {
  if (typeof value !== 'boolean') throw new Error(`${name}_must_be_boolean`);
  return value;
}

function boundedLatency(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 120000) throw new Error('latencyMs_invalid');
  return value;
}

function evidenceIds(value) {
  if (!Array.isArray(value) || value.length > 16) throw new Error('contextEvidenceIds_invalid');
  const ids = value.map((entry, index) => exactToken(entry, `contextEvidenceIds_${index}`, 180));
  if (new Set(ids).size !== ids.length) throw new Error('contextEvidenceIds_duplicate');
  return ids;
}

function hasUnexpectedFields(input) {
  return Object.keys(input).some((key) => !ALLOWED_FIELDS.has(key));
}

function rate(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

function mean(values) {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function pairKey(record) {
  return [record.experimentId, record.caseId, record.caseVersion].join('\u001f');
}

function comparePairIdentity(left, right) {
  return (
    left.experimentId.localeCompare(right.experimentId) ||
    left.caseId.localeCompare(right.caseId) ||
    left.caseVersion.localeCompare(right.caseVersion)
  );
}

function aggregate(records, arm) {
  const deliveredCount = records.filter((record) => record.responseDelivered).length;
  const fallbackCount = records.filter((record) => record.fallbackUsed).length;
  const providerAcceptedCount = records.filter((record) => record.providerCandidateAccepted).length;
  const reviewed = records.filter((record) => record.humanUsefulnessVerdict !== 'NOT_REVIEWED');
  const humanAcceptedCount = reviewed.filter((record) => record.humanUsefulnessVerdict === 'ACCEPTED').length;
  return freezeDeep({
    arm,
    count: records.length,
    deliveredCount,
    deliveryRate: rate(deliveredCount, records.length),
    fallbackCount,
    fallbackRate: rate(fallbackCount, records.length),
    providerAcceptedCount,
    providerAcceptanceRate: rate(providerAcceptedCount, records.length),
    meanLatencyMs: mean(records.map((record) => record.latencyMs)),
    medianLatencyMs: median(records.map((record) => record.latencyMs)),
    humanReviewedCount: reviewed.length,
    humanAcceptedCount,
    humanAcceptanceRate: rate(humanAcceptedCount, reviewed.length),
  });
}

function subtract(treatment, baseline, field) {
  const left = treatment[field];
  const right = baseline[field];
  return left == null || right == null ? null : left - right;
}

function booleanPairOutcome(pairs, selector, lowerIsBetter = false) {
  let treatmentWins = 0;
  let baselineWins = 0;
  let ties = 0;
  for (const pair of pairs) {
    const baseline = selector(pair.baseline);
    const treatment = selector(pair.treatment);
    if (baseline === treatment) {
      ties += 1;
      continue;
    }
    const treatmentBetter = lowerIsBetter ? !treatment && baseline : treatment && !baseline;
    if (treatmentBetter) treatmentWins += 1;
    else baselineWins += 1;
  }
  return { treatmentWins, baselineWins, ties };
}

function humanPairOutcome(pairs) {
  let treatmentWins = 0;
  let baselineWins = 0;
  let ties = 0;
  let notComparable = 0;
  for (const pair of pairs) {
    const baseline = pair.baseline.humanUsefulnessVerdict;
    const treatment = pair.treatment.humanUsefulnessVerdict;
    if (baseline === 'NOT_REVIEWED' || treatment === 'NOT_REVIEWED') {
      notComparable += 1;
      continue;
    }
    if (baseline === treatment) ties += 1;
    else if (treatment === 'ACCEPTED') treatmentWins += 1;
    else baselineWins += 1;
  }
  return { treatmentWins, baselineWins, ties, notComparable };
}

export function normalizePartnerConversationOutcomeReceipt(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('receipt_must_be_object');
  if (hasUnexpectedFields(input)) throw new Error('unexpected_or_text_bearing_field');

  const experimentId = exactToken(input.experimentId, 'experimentId');
  const caseId = exactToken(input.caseId, 'caseId');
  const caseVersion = exactToken(input.caseVersion, 'caseVersion', 120);
  const partnerId = exactToken(input.partnerId, 'partnerId', 120);
  if (partnerId !== PARTNER_ID) throw new Error('partnerId_not_saasuna');

  const arm = exactToken(input.arm, 'arm', 32);
  if (!ARMS.has(arm)) throw new Error('arm_invalid');

  const traceId = exactToken(input.traceId, 'traceId');
  const observedAt = exactToken(input.observedAt, 'observedAt', 64);
  if (!Number.isFinite(Date.parse(observedAt))) throw new Error('observedAt_invalid');

  const traceAuthority = exactToken(input.traceAuthority, 'traceAuthority', 64);
  if (traceAuthority !== 'approved') throw new Error('traceAuthority_not_approved');
  const traceProvenance = exactToken(input.traceProvenance, 'traceProvenance', 64);
  if (!TRACE_PROVENANCE.has(traceProvenance)) throw new Error('traceProvenance_not_production');

  const contextSchemaVersion = exactToken(input.contextSchemaVersion, 'contextSchemaVersion', 160);
  const contextEvidenceIds = evidenceIds(input.contextEvidenceIds);
  if (arm === TREATMENT_ARM) {
    if (contextSchemaVersion !== PARTNER_CONVERSATION_COLLECTIVE_CONTEXT_SCHEMA) {
      throw new Error('collective_context_schema_not_current');
    }
    if (contextEvidenceIds.length === 0) throw new Error('collective_context_evidence_required');
  } else {
    if (contextSchemaVersion !== 'none') throw new Error('baseline_context_schema_must_be_none');
    if (contextEvidenceIds.length !== 0) throw new Error('baseline_context_evidence_forbidden');
  }

  const responseDelivered = exactBoolean(input.responseDelivered, 'responseDelivered');
  const fallbackUsed = exactBoolean(input.fallbackUsed, 'fallbackUsed');
  const providerCandidateAccepted = exactBoolean(input.providerCandidateAccepted, 'providerCandidateAccepted');
  if (providerCandidateAccepted && (!responseDelivered || fallbackUsed)) {
    throw new Error('provider_outcome_inconsistent');
  }

  const latencyMs = boundedLatency(input.latencyMs);
  const humanUsefulnessVerdict = exactToken(input.humanUsefulnessVerdict, 'humanUsefulnessVerdict', 32);
  if (!HUMAN_VERDICTS.has(humanUsefulnessVerdict)) throw new Error('humanUsefulnessVerdict_invalid');
  if (humanUsefulnessVerdict !== 'NOT_REVIEWED' && !responseDelivered) {
    throw new Error('human_review_requires_delivered_response');
  }

  return freezeDeep({
    experimentId,
    caseId,
    caseVersion,
    partnerId,
    arm,
    traceId,
    observedAt,
    traceAuthority,
    traceProvenance,
    contextSchemaVersion,
    contextEvidenceIds: [...contextEvidenceIds],
    responseDelivered,
    fallbackUsed,
    providerCandidateAccepted,
    latencyMs,
    humanUsefulnessVerdict,
    containsPrivate: false,
    containsRawUserText: false,
  });
}

export function evaluatePartnerConversationCollectiveExperiment(recordsInput) {
  if (!Array.isArray(recordsInput)) throw new TypeError('records_must_be_array');
  const records = recordsInput.map(normalizePartnerConversationOutcomeReceipt);
  const buckets = new Map();

  for (const record of records) {
    const key = pairKey(record);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        identity: {
          experimentId: record.experimentId,
          caseId: record.caseId,
          caseVersion: record.caseVersion,
        },
        arms: new Map(),
      };
      buckets.set(key, bucket);
    }
    if (bucket.arms.has(record.arm)) {
      throw new Error(`duplicate_arm_for_pair:${record.experimentId}:${record.caseId}:${record.caseVersion}:${record.arm}`);
    }
    bucket.arms.set(record.arm, record);
  }

  const paired = [];
  const unpaired = [];
  for (const bucket of buckets.values()) {
    const baseline = bucket.arms.get(BASELINE_ARM);
    const treatment = bucket.arms.get(TREATMENT_ARM);
    if (baseline && treatment) {
      paired.push({ identity: bucket.identity, baseline, treatment });
    } else {
      unpaired.push({
        ...bucket.identity,
        presentArm: baseline ? BASELINE_ARM : TREATMENT_ARM,
        missingArm: baseline ? TREATMENT_ARM : BASELINE_ARM,
      });
    }
  }
  paired.sort((left, right) => comparePairIdentity(left.identity, right.identity));
  unpaired.sort(comparePairIdentity);

  const baselineRecords = paired.map((pair) => pair.baseline);
  const treatmentRecords = paired.map((pair) => pair.treatment);
  const baseline = aggregate(baselineRecords, BASELINE_ARM);
  const treatment = aggregate(treatmentRecords, TREATMENT_ARM);

  return freezeDeep({
    schemaVersion: SCHEMA_VERSION,
    partnerId: PARTNER_ID,
    recordCount: records.length,
    pairedCaseCount: paired.length,
    unpairedCaseCount: unpaired.length,
    excludedUnpairedRecordCount: unpaired.length,
    paired: {
      baseline,
      treatment,
      deltaTreatmentMinusBaseline: {
        deliveryRate: subtract(treatment, baseline, 'deliveryRate'),
        fallbackRate: subtract(treatment, baseline, 'fallbackRate'),
        providerAcceptanceRate: subtract(treatment, baseline, 'providerAcceptanceRate'),
        meanLatencyMs: subtract(treatment, baseline, 'meanLatencyMs'),
        medianLatencyMs: subtract(treatment, baseline, 'medianLatencyMs'),
        humanAcceptanceRate: subtract(treatment, baseline, 'humanAcceptanceRate'),
      },
      deliveryOutcome: booleanPairOutcome(paired, (record) => record.responseDelivered),
      fallbackOutcome: booleanPairOutcome(paired, (record) => record.fallbackUsed, true),
      humanUsefulnessOutcome: humanPairOutcome(paired),
    },
    unpaired,
    interpretation: {
      mode: 'DESCRIPTIVE_ONLY',
      causalClaim: false,
      productQualityClaim: false,
      humanFormalGateRequired: true,
      liveRuntimeEvidenceRequired: true,
      note: 'Paired receipts describe observed outcomes only. They do not prove that collective context improves Saasuna conversation quality.',
    },
    privacyContract: {
      strictAllowedFields: true,
      rawDialogueAccepted: false,
      privatePayloadAccepted: false,
      traceProvenance: [...TRACE_PROVENANCE],
      treatmentContextSchema: PARTNER_CONVERSATION_COLLECTIVE_CONTEXT_SCHEMA,
    },
    containsPrivate: false,
    containsRawUserText: false,
  });
}

export const PARTNER_CONVERSATION_COLLECTIVE_OUTCOME_EVAL_SCHEMA = SCHEMA_VERSION;
export const PARTNER_CONVERSATION_COLLECTIVE_OUTCOME_ARMS = Object.freeze({
  NO_COLLECTIVE: BASELINE_ARM,
  COLLECTIVE_CONTEXT: TREATMENT_ARM,
});
