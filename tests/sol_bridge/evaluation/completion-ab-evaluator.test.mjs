import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  ACCEPTANCE,
  ARM,
  evaluateCompletionExperiment,
  normalizeRunRecord,
} from '../../../tools/sol_bridge/evaluation/completion-ab-evaluator.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const RUNNER = fileURLToPath(
  new URL('../../../tools/sol_bridge/evaluation/completion-ab-evaluator-runner.mjs', import.meta.url),
);

function run(overrides = {}) {
  return {
    experimentId: 'exp-1',
    caseId: 'case-1',
    caseVersion: 'v1',
    benchmarkFingerprint: 'main@abc|acceptance@1|budget@1|tools@1',
    arm: ARM.LUNA_ONLY,
    acceptance: ACCEPTANCE.FAILED,
    testPass: false,
    reworkCycles: 2,
    humanInterventions: 1,
    outOfScopeChanges: 0,
    elapsedMs: 1000,
    solCalls: 0,
    packetResends: 0,
    attempts: 2,
    evidence: ['test://case-1'],
    ...overrides,
  };
}

test('paired treatment completion win is counted', () => {
  const report = evaluateCompletionExperiment([
    run(),
    run({
      arm: ARM.LUNA_SOL,
      acceptance: ACCEPTANCE.ACCEPTED_COMPLETE,
      testPass: true,
      reworkCycles: 0,
      humanInterventions: 0,
      elapsedMs: 800,
      solCalls: 1,
    }),
  ]);
  assert.equal(report.pairedCaseCount, 1);
  assert.equal(report.paired.completionOutcome.treatmentWins, 1);
  assert.equal(report.paired.completionOutcome.baselineWins, 0);
  assert.equal(report.paired.treatment.completionRate, 1);
  assert.equal(report.paired.baseline.completionRate, 0);
  assert.equal(report.paired.deltaTreatmentMinusBaseline.completionRate, 1);
});

test('both complete is a completion tie even when treatment is slower', () => {
  const report = evaluateCompletionExperiment([
    run({ acceptance: ACCEPTANCE.ACCEPTED_COMPLETE, testPass: true, elapsedMs: 1000 }),
    run({
      arm: ARM.LUNA_SOL,
      acceptance: ACCEPTANCE.ACCEPTED_COMPLETE,
      testPass: true,
      elapsedMs: 3000,
      solCalls: 2,
    }),
  ]);
  assert.equal(report.paired.completionOutcome.completionTies, 1);
  assert.equal(report.paired.deltaTreatmentMinusBaseline.meanElapsedMs, 2000);
  assert.equal('betterArm' in report, false);
  assert.equal(report.interpretation.causalClaim, false);
});

test('unpaired case is reported and excluded from paired metrics', () => {
  const report = evaluateCompletionExperiment([run()]);
  assert.equal(report.pairedCaseCount, 0);
  assert.equal(report.unpairedCaseCount, 1);
  assert.equal(report.paired.baseline.count, 0);
  assert.equal(report.paired.treatment.count, 0);
  assert.equal(report.paired.baseline.completionRate, null);
  assert.equal(report.unpaired[0].missingArm, ARM.LUNA_SOL);
});

test('different caseVersion values do not pair', () => {
  const report = evaluateCompletionExperiment([
    run({ caseVersion: 'v1' }),
    run({ arm: ARM.LUNA_SOL, caseVersion: 'v2' }),
  ]);
  assert.equal(report.pairedCaseCount, 0);
  assert.equal(report.unpairedCaseCount, 2);
});

test('different benchmark fingerprints do not pair', () => {
  const report = evaluateCompletionExperiment([
    run({ benchmarkFingerprint: 'baseline-a' }),
    run({ arm: ARM.LUNA_SOL, benchmarkFingerprint: 'baseline-b' }),
  ]);
  assert.equal(report.pairedCaseCount, 0);
  assert.equal(report.unpairedCaseCount, 2);
});

test('duplicate arm for same pair is rejected', () => {
  assert.throws(
    () => evaluateCompletionExperiment([run(), run({ elapsedMs: 2000 })]),
    /duplicate_arm_for_pair/,
  );
});

test('negative operational metric is rejected', () => {
  assert.throws(
    () => normalizeRunRecord(run({ humanInterventions: -1 })),
    /humanInterventions_must_be_non_negative_integer/,
  );
});

test('invalid arm is rejected', () => {
  assert.throws(() => normalizeRunRecord(run({ arm: 'SOL_ONLY' })), /invalid_arm/);
});

test('PARTIAL never counts as accepted complete', () => {
  const report = evaluateCompletionExperiment([
    run({ acceptance: ACCEPTANCE.PARTIAL, testPass: true }),
    run({
      arm: ARM.LUNA_SOL,
      acceptance: ACCEPTANCE.PARTIAL,
      testPass: true,
      solCalls: 1,
    }),
  ]);
  assert.equal(report.paired.baseline.completedCount, 0);
  assert.equal(report.paired.treatment.completedCount, 0);
  assert.equal(report.paired.completionOutcome.completionTies, 1);
});

test('empty input returns zero paired cases with null rates and no superiority claim', () => {
  const report = evaluateCompletionExperiment([]);
  assert.equal(report.recordCount, 0);
  assert.equal(report.pairedCaseCount, 0);
  assert.equal(report.paired.baseline.completionRate, null);
  assert.equal(report.paired.treatment.completionRate, null);
  assert.equal(report.interpretation.mode, 'DESCRIPTIVE_ONLY');
  assert.equal(report.interpretation.statisticalSignificanceTested, false);
});

test('Sol-call and packet-resend costs are reported separately', () => {
  const report = evaluateCompletionExperiment([
    run({ solCalls: 0, packetResends: 0 }),
    run({
      arm: ARM.LUNA_SOL,
      solCalls: 3,
      packetResends: 2,
    }),
  ]);
  assert.equal(report.paired.baseline.meanSolCalls, 0);
  assert.equal(report.paired.treatment.meanSolCalls, 3);
  assert.equal(report.paired.deltaTreatmentMinusBaseline.meanSolCalls, 3);
  assert.equal(report.paired.deltaTreatmentMinusBaseline.meanPacketResends, 2);
});

test('unpaired output ordering is deterministic', () => {
  const report = evaluateCompletionExperiment([
    run({ experimentId: 'z', caseId: 'b' }),
    run({ experimentId: 'a', caseId: 'c' }),
    run({ experimentId: 'a', caseId: 'a' }),
  ]);
  assert.deepEqual(
    report.unpaired.map((item) => `${item.experimentId}/${item.caseId}`),
    ['a/a', 'a/c', 'z/b'],
  );
});

test('runner accepts object-with-records and emits a report', () => {
  const input = JSON.stringify({
    records: [
      run(),
      run({ arm: ARM.LUNA_SOL, acceptance: ACCEPTANCE.ACCEPTED_COMPLETE, testPass: true, solCalls: 1 }),
    ],
  });
  const out = spawnSync(process.execPath, [RUNNER], { input, encoding: 'utf8', cwd: HERE });
  assert.equal(out.status, 0);
  const parsed = JSON.parse(out.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.report.pairedCaseCount, 1);
});

test('runner fails closed on invalid JSON', () => {
  const out = spawnSync(process.execPath, [RUNNER], { input: '{bad json', encoding: 'utf8', cwd: HERE });
  assert.equal(out.status, 2);
  const parsed = JSON.parse(out.stdout);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.status, 'INVALID_JSON');
});
