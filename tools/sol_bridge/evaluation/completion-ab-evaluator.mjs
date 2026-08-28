export const ARM = Object.freeze({
  LUNA_ONLY: 'LUNA_ONLY',
  LUNA_SOL: 'LUNA_SOL',
});

export const ACCEPTANCE = Object.freeze({
  ACCEPTED_COMPLETE: 'ACCEPTED_COMPLETE',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
  BLOCKED: 'BLOCKED',
});

const VALID_ARMS = new Set(Object.values(ARM));
const VALID_ACCEPTANCE = new Set(Object.values(ACCEPTANCE));
const BASELINE_ARM = ARM.LUNA_ONLY;
const TREATMENT_ARM = ARM.LUNA_SOL;

function requiredString(value, name, max = 512) {
  if (typeof value !== 'string') throw new TypeError(`${name}_must_be_string`);
  const out = value.trim();
  if (!out) throw new Error(`${name}_required`);
  if (out.length > max) throw new Error(`${name}_too_long`);
  if (out.includes('\u0000')) throw new Error(`${name}_nul`);
  return out;
}

function nonNegativeInteger(value, name, fallback = null) {
  if (value == null && fallback != null) return fallback;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name}_must_be_non_negative_integer`);
  }
  return value;
}

function requiredBoolean(value, name) {
  if (typeof value !== 'boolean') throw new Error(`${name}_must_be_boolean`);
  return value;
}

function optionalEvidence(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error('evidence_must_be_array');
  return value.map((entry, index) => requiredString(entry, `evidence_${index}`, 2048));
}

export function normalizeRunRecord(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('record_must_be_object');
  }

  const arm = requiredString(input.arm, 'arm', 32);
  if (!VALID_ARMS.has(arm)) throw new Error(`invalid_arm:${arm}`);

  const acceptance = requiredString(input.acceptance, 'acceptance', 64);
  if (!VALID_ACCEPTANCE.has(acceptance)) throw new Error(`invalid_acceptance:${acceptance}`);

  return Object.freeze({
    experimentId: requiredString(input.experimentId, 'experimentId', 240),
    caseId: requiredString(input.caseId, 'caseId', 240),
    caseVersion: requiredString(input.caseVersion, 'caseVersion', 120),
    benchmarkFingerprint: requiredString(input.benchmarkFingerprint, 'benchmarkFingerprint', 512),
    arm,
    acceptance,
    testPass: requiredBoolean(input.testPass, 'testPass'),
    reworkCycles: nonNegativeInteger(input.reworkCycles, 'reworkCycles', 0),
    humanInterventions: nonNegativeInteger(input.humanInterventions, 'humanInterventions', 0),
    outOfScopeChanges: nonNegativeInteger(input.outOfScopeChanges, 'outOfScopeChanges', 0),
    elapsedMs: nonNegativeInteger(input.elapsedMs, 'elapsedMs', 0),
    solCalls: nonNegativeInteger(input.solCalls, 'solCalls', 0),
    packetResends: nonNegativeInteger(input.packetResends, 'packetResends', 0),
    attempts: nonNegativeInteger(input.attempts, 'attempts', 1),
    evidence: Object.freeze(optionalEvidence(input.evidence)),
  });
}

function pairKey(record) {
  return [
    record.experimentId,
    record.caseId,
    record.caseVersion,
    record.benchmarkFingerprint,
  ].join('\u001f');
}

function identity(record) {
  return {
    experimentId: record.experimentId,
    caseId: record.caseId,
    caseVersion: record.caseVersion,
    benchmarkFingerprint: record.benchmarkFingerprint,
  };
}

function isComplete(record) {
  return record.acceptance === ACCEPTANCE.ACCEPTED_COMPLETE;
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function rate(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

function aggregate(records, arm) {
  const completedCount = records.filter(isComplete).length;
  const testPassCount = records.filter((record) => record.testPass).length;
  return {
    arm,
    count: records.length,
    completedCount,
    completionRate: rate(completedCount, records.length),
    testPassCount,
    testPassRate: rate(testPassCount, records.length),
    meanReworkCycles: mean(records.map((record) => record.reworkCycles)),
    meanHumanInterventions: mean(records.map((record) => record.humanInterventions)),
    meanOutOfScopeChanges: mean(records.map((record) => record.outOfScopeChanges)),
    meanElapsedMs: mean(records.map((record) => record.elapsedMs)),
    medianElapsedMs: median(records.map((record) => record.elapsedMs)),
    meanSolCalls: mean(records.map((record) => record.solCalls)),
    meanPacketResends: mean(records.map((record) => record.packetResends)),
    meanAttempts: mean(records.map((record) => record.attempts)),
  };
}

function subtract(treatment, baseline, field) {
  const a = treatment[field];
  const b = baseline[field];
  return a == null || b == null ? null : a - b;
}

function delta(treatment, baseline) {
  return {
    direction: 'TREATMENT_MINUS_BASELINE',
    completionRate: subtract(treatment, baseline, 'completionRate'),
    testPassRate: subtract(treatment, baseline, 'testPassRate'),
    meanReworkCycles: subtract(treatment, baseline, 'meanReworkCycles'),
    meanHumanInterventions: subtract(treatment, baseline, 'meanHumanInterventions'),
    meanOutOfScopeChanges: subtract(treatment, baseline, 'meanOutOfScopeChanges'),
    meanElapsedMs: subtract(treatment, baseline, 'meanElapsedMs'),
    medianElapsedMs: subtract(treatment, baseline, 'medianElapsedMs'),
    meanSolCalls: subtract(treatment, baseline, 'meanSolCalls'),
    meanPacketResends: subtract(treatment, baseline, 'meanPacketResends'),
    meanAttempts: subtract(treatment, baseline, 'meanAttempts'),
  };
}

function compareIdentity(a, b) {
  return (
    a.experimentId.localeCompare(b.experimentId) ||
    a.caseId.localeCompare(b.caseId) ||
    a.caseVersion.localeCompare(b.caseVersion) ||
    a.benchmarkFingerprint.localeCompare(b.benchmarkFingerprint)
  );
}

export function evaluateCompletionExperiment(recordsInput) {
  if (!Array.isArray(recordsInput)) throw new TypeError('records_must_be_array');
  const records = recordsInput.map(normalizeRunRecord);
  const buckets = new Map();

  for (const record of records) {
    const key = pairKey(record);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { identity: identity(record), arms: new Map() };
      buckets.set(key, bucket);
    }
    if (bucket.arms.has(record.arm)) {
      throw new Error(
        `duplicate_arm_for_pair:${record.experimentId}:${record.caseId}:${record.caseVersion}:${record.arm}`,
      );
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
      const presentArm = baseline ? BASELINE_ARM : TREATMENT_ARM;
      const missingArm = baseline ? TREATMENT_ARM : BASELINE_ARM;
      unpaired.push({
        ...bucket.identity,
        presentArm,
        missingArm,
      });
    }
  }

  paired.sort((a, b) => compareIdentity(a.identity, b.identity));
  unpaired.sort(compareIdentity);

  const baselineRecords = paired.map((pair) => pair.baseline);
  const treatmentRecords = paired.map((pair) => pair.treatment);
  const baselineAggregate = aggregate(baselineRecords, BASELINE_ARM);
  const treatmentAggregate = aggregate(treatmentRecords, TREATMENT_ARM);

  let treatmentWins = 0;
  let baselineWins = 0;
  let completionTies = 0;
  for (const pair of paired) {
    const baselineComplete = isComplete(pair.baseline);
    const treatmentComplete = isComplete(pair.treatment);
    if (treatmentComplete && !baselineComplete) treatmentWins += 1;
    else if (baselineComplete && !treatmentComplete) baselineWins += 1;
    else completionTies += 1;
  }

  return {
    schemaVersion: 1,
    recordCount: records.length,
    pairedCaseCount: paired.length,
    unpairedCaseCount: unpaired.length,
    excludedUnpairedRecordCount: unpaired.length,
    paired: {
      baseline: baselineAggregate,
      treatment: treatmentAggregate,
      deltaTreatmentMinusBaseline: delta(treatmentAggregate, baselineAggregate),
      completionOutcome: {
        treatmentWins,
        baselineWins,
        completionTies,
      },
    },
    unpaired,
    interpretation: {
      mode: 'DESCRIPTIVE_ONLY',
      baselineArm: BASELINE_ARM,
      treatmentArm: TREATMENT_ARM,
      causalClaim: false,
      statisticalSignificanceTested: false,
      note: 'This report records paired descriptive outcomes only. It does not by itself prove that Luna+Sol is better.',
    },
    comparisonContract: {
      pairFields: ['experimentId', 'caseId', 'caseVersion', 'benchmarkFingerprint'],
      completionCriterion: 'acceptance === ACCEPTED_COMPLETE',
      unpairedPolicy: 'EXCLUDE_FROM_PAIRED_METRICS',
      deltaDirection: 'LUNA_SOL_MINUS_LUNA_ONLY',
    },
  };
}
