import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateNeutralRepair,
  REPAIR_TIMING_POLICY_ID,
} from '../browser/partner-humanlike-repair-evaluator.mjs';

function base(overrides = {}) {
  return {
    partnerId: 'partner-current',
    sessionId: 'session-1',
    turnId: 'turn-1',
    sourceUseSite: 'partner-response',
    rulesContentVersion: 'partner-r1',
    troubleClass: 'none',
    turnBoundaryState: 'open',
    processingLatencyState: 'normal',
    priorRepairOutcome: 'none',
    repairAttemptIndex: 0,
    identityState: 'matched',
    versionState: 'current',
    evidenceAuthority: 'approved',
    sourceState: 'approved',
    selfRepairAccepted: false,
    userResumedSpeaking: false,
    authorizedSpecificTarget: null,
    ...overrides,
  };
}

test('clear accepted input adds no repair and no intentional hold', () => {
  const result = evaluateNeutralRepair(base());
  assert.equal(result.ok, true);
  assert.equal(result.policyId, REPAIR_TIMING_POLICY_ID);
  assert.equal(result.repairNeeded, false);
  assert.equal(result.addedHold, 'none');
  assert.equal(result.expression, 'none');
  assert.equal(result.reason, 'CLEAR_INPUT');
});

test('repair input exposes only a bounded-candidate hold marker, never milliseconds', () => {
  const result = evaluateNeutralRepair(base({ troubleClass: 'hearing_or_parse_unknown' }));
  assert.equal(result.ok, true);
  assert.equal(result.repairNeeded, true);
  assert.equal(result.addedHold, 'bounded_candidate');
  assert.equal(result.expression, 'neutral_clarification');
  assert.equal(result.specificTarget, null);
  assert.equal(/millisecond|duration|timeout|\bms\b/i.test(JSON.stringify(result)), false);
});

test('observed slow or unknown backend state never adds an extra hold', () => {
  for (const processingLatencyState of ['already_high', 'unknown']) {
    const result = evaluateNeutralRepair(base({
      troubleClass: 'reference_ambiguity',
      processingLatencyState,
    }));
    assert.equal(result.repairNeeded, true);
    assert.equal(result.addedHold, 'none');
  }
});

test('self-repair cancels pending clarification and reevaluates as accepted input', () => {
  const result = evaluateNeutralRepair(base({
    troubleClass: 'reference_ambiguity',
    turnBoundaryState: 'repair_pending',
    selfRepairAccepted: true,
  }));
  assert.equal(result.repairNeeded, false);
  assert.equal(result.cancelPending, true);
  assert.equal(result.expression, 'none');
  assert.equal(result.reason, 'SELF_REPAIR_ACCEPTED');
});

test('user resumed speaking suppresses a late partner utterance', () => {
  const result = evaluateNeutralRepair(base({
    troubleClass: 'candidate_confirmation',
    turnBoundaryState: 'repair_pending',
    userResumedSpeaking: true,
  }));
  assert.equal(result.repairNeeded, false);
  assert.equal(result.cancelPending, true);
  assert.equal(result.expression, 'none');
  assert.equal(result.reason, 'USER_RESUMED_SPEAKING');
});

test('authorized specific target yields a marker only, not dialogue text', () => {
  const result = evaluateNeutralRepair(base({
    troubleClass: 'reference_ambiguity',
    authorizedSpecificTarget: 'candidate-A',
  }));
  assert.equal(result.repairNeeded, true);
  assert.equal(result.expression, 'specific_confirmation');
  assert.equal(result.specificTarget, 'candidate-A');
  assert.equal(result.containsCharacterText, false);
  assert.equal('text' in result, false);
  assert.equal('dialogue' in result, false);
});

test('without an authorized specific target the first repair remains neutral', () => {
  const result = evaluateNeutralRepair(base({ troubleClass: 'reference_ambiguity' }));
  assert.equal(result.expression, 'neutral_clarification');
  assert.equal(result.specificTarget, null);
  assert.equal(result.reason, 'NEUTRAL_REPAIR');
});

test('repeated unresolved repair without new specificity converges to silence', () => {
  const result = evaluateNeutralRepair(base({
    troubleClass: 'reference_ambiguity',
    priorRepairOutcome: 'unresolved',
    repairAttemptIndex: 1,
  }));
  assert.equal(result.ok, true);
  assert.equal(result.repairNeeded, false);
  assert.equal(result.addedHold, 'none');
  assert.equal(result.expression, 'silence');
  assert.equal(result.converged, true);
  assert.equal(result.reason, 'REPEAT_REPAIR_CONVERGED');
});

test('new authorized specificity may replace an unresolved generic repair without looping', () => {
  const result = evaluateNeutralRepair(base({
    troubleClass: 'reference_ambiguity',
    priorRepairOutcome: 'unresolved',
    repairAttemptIndex: 1,
    authorizedSpecificTarget: 'candidate-B',
  }));
  assert.equal(result.repairNeeded, true);
  assert.equal(result.expression, 'specific_confirmation');
  assert.equal(result.specificTarget, 'candidate-B');
});

test('identity, version, authority and source uncertainty fail closed to silence', () => {
  const cases = [
    ['identityState', 'unknown', 'IDENTITY_NOT_MATCHED'],
    ['identityState', 'mismatch', 'IDENTITY_NOT_MATCHED'],
    ['versionState', 'unknown', 'VERSION_NOT_CURRENT'],
    ['versionState', 'mismatch', 'VERSION_NOT_CURRENT'],
    ['evidenceAuthority', 'unknown', 'AUTHORITY_NOT_APPROVED'],
    ['evidenceAuthority', 'rejected', 'AUTHORITY_NOT_APPROVED'],
    ['sourceState', 'unknown', 'SOURCE_NOT_APPROVED'],
    ['sourceState', 'rejected', 'SOURCE_NOT_APPROVED'],
  ];
  for (const [key, value, reason] of cases) {
    const result = evaluateNeutralRepair(base({ [key]: value, troubleClass: 'reference_ambiguity' }));
    assert.equal(result.ok, false);
    assert.equal(result.expression, 'silence');
    assert.equal(result.addedHold, 'none');
    assert.equal(result.cancelPending, true);
    assert.equal(result.reason, reason);
  }
});

test('stale-or-authority-unknown trouble class fail-closes even with otherwise valid boundary metadata', () => {
  const result = evaluateNeutralRepair(base({ troubleClass: 'stale_or_authority_unknown' }));
  assert.equal(result.ok, false);
  assert.equal(result.expression, 'silence');
  assert.equal(result.reason, 'STALE_OR_AUTHORITY_UNKNOWN');
});

test('already accepted or resolved turns do not restart repair', () => {
  const accepted = evaluateNeutralRepair(base({
    troubleClass: 'reference_ambiguity',
    turnBoundaryState: 'accepted',
  }));
  assert.equal(accepted.repairNeeded, false);
  assert.equal(accepted.reason, 'TURN_ALREADY_ACCEPTED');

  const resolved = evaluateNeutralRepair(base({
    troubleClass: 'reference_ambiguity',
    priorRepairOutcome: 'resolved',
  }));
  assert.equal(resolved.repairNeeded, false);
  assert.equal(resolved.reason, 'PRIOR_REPAIR_RESOLVED');
});

test('malformed boundary ids, states, attempts, signals and targets fail closed', () => {
  const cases = [
    base({ sessionId: ' session-1' }),
    base({ troubleClass: 'invented' }),
    base({ processingLatencyState: 'fast-enough' }),
    base({ repairAttemptIndex: -1 }),
    base({ repairAttemptIndex: 1.5 }),
    base({ selfRepairAccepted: 'yes' }),
    base({ authorizedSpecificTarget: ' candidate-A' }),
  ];
  for (const input of cases) {
    const result = evaluateNeutralRepair(input);
    assert.equal(result.ok, false);
    assert.equal(result.expression, 'silence');
    assert.equal(result.addedHold, 'none');
  }
});

test('decision is deterministic for retry/reconnect and exposes a stable dedupe key', () => {
  const input = base({ troubleClass: 'candidate_confirmation' });
  const first = evaluateNeutralRepair(input);
  const retry = evaluateNeutralRepair(structuredClone(input));
  assert.deepEqual(retry, first);
  assert.equal(typeof first.decisionKey, 'string');

  const nextTurn = evaluateNeutralRepair({ ...input, turnId: 'turn-2' });
  assert.notEqual(nextTurn.decisionKey, first.decisionKey);
});

test('input is not mutated, output is frozen, private transcript and game mutation payloads are ignored', () => {
  const input = base({
    troubleClass: 'hearing_or_parse_unknown',
    rawTranscript: 'SECRET PRIVATE TRANSCRIPT',
    relationship: { delta: 99 },
    reward: { coins: 999 },
    save: { overwrite: true },
    battle: { winner: 'P1' },
    card: { id: 'secret-card' },
  });
  const before = structuredClone(input);
  const result = evaluateNeutralRepair(input);

  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(result.containsPrivate, false);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('SECRET PRIVATE TRANSCRIPT'), false);
  for (const forbidden of ['relationship', 'reward', 'save', 'battle', 'secret-card']) {
    assert.equal(serialized.includes(forbidden), false);
  }
  assert.deepEqual(Object.keys(result).sort(), [
    'addedHold',
    'cancelPending',
    'containsCharacterText',
    'containsPrivate',
    'converged',
    'decisionKey',
    'expression',
    'ok',
    'policyId',
    'reason',
    'repairNeeded',
    'specificTarget',
  ]);
});
